import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import defaultFirebaseConfig from '../../firebase-applet-config.json';
import { ApiResponseError } from './httpClient';

const env = import.meta.env;

function cleanAuthDomain(raw: string | undefined, fallback: string): string {
  const candidate = (raw || '').trim();
  if (!candidate) return fallback;
  return candidate.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

const resolvedFirebaseConfig = {
  projectId:
    (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ||
    defaultFirebaseConfig.projectId,
  appId:
    (env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ||
    defaultFirebaseConfig.appId,
  apiKey:
    (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ||
    defaultFirebaseConfig.apiKey,
  authDomain: cleanAuthDomain(
    env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    defaultFirebaseConfig.authDomain
  ),
  storageBucket:
    (env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined)?.trim() ||
    defaultFirebaseConfig.storageBucket,
  messagingSenderId:
    (env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined)?.trim() ||
    defaultFirebaseConfig.messagingSenderId,
};

if (env.DEV) {
  if (!resolvedFirebaseConfig.apiKey || !resolvedFirebaseConfig.projectId) {
    console.warn(
      '[WorkshopTrack Auth Debug] Konfigurasi Firebase belum lengkap (projectId / apiKey kosong).'
    );
  }
  const supabaseUrl = (env.VITE_SUPABASE_URL as string | undefined)?.trim();
  if (supabaseUrl && !/^https:\/\/.+\.supabase\.co/i.test(supabaseUrl)) {
    console.warn(
      '[WorkshopTrack Config Debug] Format VITE_SUPABASE_URL tidak standar (seharusnya https://<project-ref>.supabase.co).'
    );
  }
}

const app = initializeApp(resolvedFirebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: 'select_account' });

export function formatFirebaseAuthError(err: unknown): string {
  if (err instanceof ApiResponseError) {
    return err.message;
  }

  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const message = err instanceof Error ? err.message : '';
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : 'domain ini';

  if (env.DEV) {
    console.warn('[WorkshopTrack Firebase Auth Debug]', {
      code: code || '(none)',
      hostname,
      authDomain: resolvedFirebaseConfig.authDomain,
    });
  }

  if (
    code === 'auth/unauthorized-domain' ||
    message.includes('auth/unauthorized-domain')
  ) {
    return `Domain "${hostname}" belum diizinkan pada Firebase Authentication. Tambahkan "${hostname}" pada Firebase Console → Authentication → Settings → Authorized domains.`;
  }

  if (
    code === 'auth/operation-not-allowed' ||
    message.includes('auth/operation-not-allowed')
  ) {
    return 'Provider login Google belum diaktifkan pada Firebase Console (Authentication → Sign-in method → Google).';
  }

  if (
    code === 'auth/invalid-api-key' ||
    message.includes('auth/invalid-api-key')
  ) {
    return 'Konfigurasi API Key Firebase tidak valid. Periksa VITE_FIREBASE_API_KEY atau firebase-applet-config.json.';
  }

  if (
    code === 'auth/internal-error' ||
    message.includes('auth/internal-error')
  ) {
    return `Terjadi kendala saat memproses OAuth Google pada domain "${hostname}". Pastikan domain terdaftar di Authorized domains Firebase dan koneksi tidak diblokir proxy.`;
  }

  if (
    code === 'auth/network-request-failed' ||
    message.includes('auth/network-request-failed')
  ) {
    return 'Gagal menghubungi layanan autentikasi Google karena kendala jaringan. Periksa koneksi internet Anda.';
  }

  if (
    code === 'auth/popup-blocked' ||
    message.includes('auth/popup-blocked')
  ) {
    return 'Jendela popup login diblokir oleh browser. Mengalihkan ke metode login redirect...';
  }

  return 'Gagal melakukan autentikasi Google. Pastikan domain terdaftar di Firebase Authorized domains dan jendela login diizinkan.';
}
