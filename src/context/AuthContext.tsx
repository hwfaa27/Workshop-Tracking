import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  onIdTokenChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { UserProfile, UserRole } from '../types/workshop';

type SyncListener = (event: string, entityId?: string) => void;

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
      if (init?.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const response = await fetch(path, {
        ...init,
        headers,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data?.error || `Permintaan gagal dengan kode status ${response.status}`
        );
      }
      return data as T;
    },
    []
  );

  const fetchMyProfile = useCallback(async (user: User) => {
    try {
      const token = await user.getIdToken();
      tokenRef.current = token;
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Gagal memuat profil pengguna.');
      }
      setProfile(json.user);
      setAuthError(null);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Gagal memverifikasi akun.'
      );
      setProfile(null);
    }
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
          try {
            const msg = JSON.parse(evt.data);
            if (msg?.type === 'auth:ok') {
              setWsConnected(true);
            } else if (msg?.type === 'workshop:sync') {
              for (const fn of listenersRef.current) {
                fn(msg.event, msg.entityId);
              }
            }
          } catch {
            // Ignore malformed socket frames
          }
        };

        socket.onclose = () => {
          setWsConnected(false);
          if (!unmounted) {
            reconnectTimerRef.current = window.setTimeout(connectWs, 3500);
          }
        };
      } catch {
        if (!unmounted) {
          reconnectTimerRef.current = window.setTimeout(connectWs, 4000);
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
      const message =
        err instanceof Error ? err.message : 'Login dibatalkan atau gagal.';
      if (!message.includes('popup-closed-by-user')) {
        setAuthError('Gagal melakukan autentikasi Google. Pastikan jendela login tidak diblokir.');
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    tokenRef.current = null;
    setProfile(null);
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
