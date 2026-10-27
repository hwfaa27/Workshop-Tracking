import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  getRedirectResult,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  auth,
  formatFirebaseAuthError,
  googleAuthProvider,
} from '../lib/firebase';
import {
  ApiResponseError,
  parseSafeJsonResponse,
  resolveApiUrl,
  safeJsonParse,
} from '../lib/httpClient';
import { UserProfile, UserRole } from '../types/workshop';

type SyncListener = (event: string, entityId?: string) => void;

function resolveCredentialsMode(url: string): RequestCredentials {
  return /^https?:\/\//i.test(url) ? 'include' : 'same-origin';
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  wsConnected: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchMyRole: (role: UserRole) => Promise<void>;
  apiFetch: <T>(path: string, init?: RequestInit) => Promise<T>;
  subscribeSync: (listener: SyncListener) => () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Store ID token strictly in memory (never localStorage)
  const tokenRef = useRef<string | null>(null);
  const listenersRef = useRef<Set<SyncListener>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const subscribeSync = useCallback((listener: SyncListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const apiFetch = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const currentUser = auth.currentUser;
      let token = tokenRef.current;
      if (currentUser) {
        token = await currentUser.getIdToken();
        tokenRef.current = token;
      }

      if (!token) {
        throw new Error('Silakan login terlebih dahulu.');
      }

      const headers = new Headers(init?.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      headers.set('Accept', 'application/json');
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const url = resolveApiUrl(path);
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          credentials: init?.credentials ?? resolveCredentialsMode(url),
          headers,
        });
      } catch (networkErr) {
        if (import.meta.env.DEV) {
          console.warn('[WorkshopTrack Network Debug] Gagal menghubungi API:', {
            endpoint: path,
            reason:
              networkErr instanceof Error ? networkErr.message : 'Network error',
          });
        }
        throw new Error(
          'Tidak dapat terhubung ke server backend. Periksa koneksi internet atau status server API.'
        );
      }

      return await parseSafeJsonResponse<T>(response, path);
    },
    []
  );

  const fetchMyProfile = useCallback(async (user: User) => {
    const endpoint = '/api/auth/me';
    const url = resolveApiUrl(endpoint);

    const requestProfileWithToken = async (forceRefresh: boolean) => {
      const token = await user.getIdToken(forceRefresh);
      tokenRef.current = token;

      let res: Response;
      try {
        res = await fetch(url, {
          method: 'GET',
          credentials: resolveCredentialsMode(url),
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
      } catch (networkErr) {
        if (import.meta.env.DEV) {
          console.warn('[WorkshopTrack Auth Network Debug]', {
            endpoint,
            reason:
              networkErr instanceof Error ? networkErr.message : 'Network error',
          });
        }
        throw new Error(
          'Tidak dapat terhubung ke server backend WorkshopTrack. Periksa koneksi internet atau status server API.'
        );
      }

      return await parseSafeJsonResponse<{
        authenticated?: boolean;
        user?: UserProfile | null;
      }>(res, endpoint);
    };

    try {
      let json: { authenticated?: boolean; user?: UserProfile | null };
      try {
        json = await requestProfileWithToken(false);
      } catch (firstErr) {
        if (firstErr instanceof ApiResponseError && firstErr.statusCode === 401) {
          // Force-refresh Firebase ID token once in case cached token just expired
          json = await requestProfileWithToken(true);
        } else {
          throw firstErr;
        }
      }

      if (!json?.user || !json.user.id) {
        throw new Error(
          'Respons profil pengguna dari server tidak lengkap. Autentikasi dibatalkan demi keamanan.'
        );
      }

      setProfile(json.user);
      setAuthError(null);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[WorkshopTrack Auth Sync Debug]', {
          endpoint: '/api/auth/me',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      // Never assume authentication succeeded if backend verification fails
      setProfile(null);
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Gagal memverifikasi sesi akun pada server.'
      );
    }
  }, []);

  // Handle Google OAuth redirect callback result (used when mobile browser blocks popups)
  useEffect(() => {
    getRedirectResult(auth).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : '';
      if (msg && !msg.includes('popup-closed-by-user')) {
        setAuthError(formatFirebaseAuthError(err));
      }
    });
  }, []);

  // Connect WebSocket for real-time cross-device sync
  useEffect(() => {
    if (!firebaseUser || !profile) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let unmounted = false;

    const connectWs = async () => {
      if (unmounted) return;
      try {
        const token = await firebaseUser.getIdToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = socket;

        socket.onopen = () => {
          socket.send(JSON.stringify({ type: 'auth', token }));
        };

        socket.onmessage = (evt) => {
          if (typeof evt.data !== 'string') return;
          const msg = safeJsonParse<{
            type?: string;
            event?: string;
            entityId?: string;
          }>(evt.data);
          if (!msg) return;

          if (msg.type === 'auth:ok') {
            setWsConnected(true);
          } else if (msg.type === 'workshop:sync' && msg.event) {
            for (const fn of listenersRef.current) {
              fn(msg.event, msg.entityId);
            }
          }
        };

        socket.onerror = () => {
          // Handled cleanly in onclose with fallback polling when WS is unavailable (e.g. serverless Vercel)
        };

        socket.onclose = () => {
          setWsConnected(false);
          if (!unmounted) {
            reconnectTimerRef.current = window.setTimeout(connectWs, 6000);
          }
        };
      } catch {
        if (!unmounted) {
          reconnectTimerRef.current = window.setTimeout(connectWs, 6000);
        }
      }
    };

    connectWs();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [firebaseUser, profile]);

  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchMyProfile(user);
      } else {
        tokenRef.current = null;
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [fetchMyProfile]);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: unknown) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      const message = err instanceof Error ? err.message : '';

      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        message.includes('popup-closed-by-user')
      ) {
        return;
      }

      // Fallback to OAuth redirect flow when mobile standalone PWA or browser blocks popups
      if (code === 'auth/popup-blocked' || message.includes('popup-blocked')) {
        try {
          await signInWithRedirect(auth, googleAuthProvider);
          return;
        } catch (redirectErr) {
          setAuthError(formatFirebaseAuthError(redirectErr));
          return;
        }
      }

      setAuthError(formatFirebaseAuthError(err));
    }
  };

  const signOut = async () => {
    const logoutUrl = resolveApiUrl('/api/auth/logout');
    try {
      await fetch(logoutUrl, {
        method: 'POST',
        credentials: resolveCredentialsMode(logoutUrl),
        headers: { Accept: 'application/json' },
      });
    } catch {
      // Ignore network errors during logout cleanup
    }
    await firebaseSignOut(auth);
    tokenRef.current = null;
    setProfile(null);
    setAuthError(null);
  };

  const refreshProfile = async () => {
    if (auth.currentUser) {
      await fetchMyProfile(auth.currentUser);
    }
  };

  const switchMyRole = async (role: UserRole) => {
    const data = await apiFetch<{ user: UserProfile }>('/api/auth/self-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
    setProfile(data.user);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        wsConnected,
        signInWithGoogle,
        signOut,
        refreshProfile,
        switchMyRole,
        apiFetch,
        subscribeSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider.');
  }
  return ctx;
}
