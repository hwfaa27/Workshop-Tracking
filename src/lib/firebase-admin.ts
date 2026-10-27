import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { type Auth, getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

export const serverFirebaseProjectId =
  process.env.FIREBASE_PROJECT_ID?.trim() ||
  process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
  firebaseConfig.projectId;

let cachedAdminAuth: Auth | null = null;

export function getAdminAuth(): Auth {
  if (cachedAdminAuth) {
    return cachedAdminAuth;
  }

  if (!getApps().length) {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (serviceAccountRaw) {
      try {
        const parsedCred = JSON.parse(serviceAccountRaw) as {
          project_id?: string;
          private_key?: string;
          client_email?: string;
        };
        if (typeof parsedCred.private_key === 'string') {
          parsedCred.private_key = parsedCred.private_key.replace(/\\n/g, '\n');
        }
        initializeApp({
          credential: cert(parsedCred as Parameters<typeof cert>[0]),
          projectId: parsedCred.project_id || serverFirebaseProjectId,
        });
      } catch {
        console.error(
          '[WorkshopTrack Server] Format FIREBASE_SERVICE_ACCOUNT_JSON tidak valid; beralih ke projectId standar.'
        );
        if (!getApps().length) {
          initializeApp({ projectId: serverFirebaseProjectId });
        }
      }
    } else {
      initializeApp({ projectId: serverFirebaseProjectId });
    }
  }

  cachedAdminAuth = getAuth();
  return cachedAdminAuth;
}

export const adminAuth = {
  verifyIdToken: (idToken: string, checkRevoked?: boolean) =>
    getAdminAuth().verifyIdToken(idToken, checkRevoked),
};
