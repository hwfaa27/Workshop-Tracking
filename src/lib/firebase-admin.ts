import crypto from 'node:crypto';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

/**
 * Serverless-safe Firebase / Google ID Token verifier for WorkshopTrack.
 *
 * Why we do NOT statically import `firebase-admin/auth` at module top-level:
 * `firebase-admin@14.x` declares `"engines": { "node": ">=22" }` and pulls in
 * CommonJS `jwks-rsa@4.x` -> `require('jose')` (where `jose@6.x` is pure ESM).
 * On Vercel Serverless Functions running Node 18.x or Node 20.x (<20.19),
 * a top-level `import { getAuth } from 'firebase-admin/auth'` crashes the
 * entire Lambda at module import time with `ERR_REQUIRE_ESM` (HTTP 500) before
 * Express or any route handler executes.
 *
 * This module implements Google's official Firebase ID Token RS256 verification
 * specification using built-in `node:crypto` against Google's official X.509
 * public certificates (`securetoken@system.gserviceaccount.com`), with optional
 * lazy `firebase-admin` revocation checking when `FIREBASE_SERVICE_ACCOUNT_JSON`
 * is configured on compatible runtimes.
 */

const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const DEFAULT_CERT_TTL_MS = 60 * 60 * 1000; // 1 hour fallback if Cache-Control absent
const MIN_REFRESH_INTERVAL_MS = 30 * 1000; // Prevent cert refresh storms

export interface DecodedFirebaseToken {
  uid: string;
  sub: string;
  aud: string;
  iss: string;
  iat: number;
  exp: number;
  auth_time?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [key: string]: unknown;
}

export type AuthErrorCode =
  | 'AUTH_INVALID_TOKEN'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_PROJECT_MISMATCH'
  | 'AUTH_CONFIG_MISSING'
  | 'AUTH_KEY_FETCH_FAILED';

export class AuthTokenError extends Error {
  code: AuthErrorCode;
  statusCode: number;

  constructor(code: AuthErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = 'AuthTokenError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function resolveServerFirebaseProjectId(): string {
  return (
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    firebaseConfig.projectId?.trim() ||
    ''
  );
}

export const serverFirebaseProjectId = resolveServerFirebaseProjectId();

interface CertCacheState {
  certs: Record<string, string>;
  expiresAt: number;
  fetchedAt: number;
}

let certCache: CertCacheState | null = null;
let inflightCertFetch: Promise<Record<string, string>> | null = null;

function parseMaxAgeMs(cacheControl: string | null): number {
  if (!cacheControl) {
    return DEFAULT_CERT_TTL_MS;
  }
  const match = /max-age=(\d+)/i.exec(cacheControl);
  if (!match) {
    return DEFAULT_CERT_TTL_MS;
  }
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return DEFAULT_CERT_TTL_MS;
  }
  return seconds * 1000;
}

async function fetchGooglePublicCerts(
  forceRefresh = false
): Promise<Record<string, string>> {
  const now = Date.now();
  if (
    !forceRefresh &&
    certCache &&
    certCache.expiresAt > now &&
    Object.keys(certCache.certs).length > 0
  ) {
    return certCache.certs;
  }

  if (
    forceRefresh &&
    certCache &&
    now - certCache.fetchedAt < MIN_REFRESH_INTERVAL_MS &&
    Object.keys(certCache.certs).length > 0
  ) {
    return certCache.certs;
  }

  if (!inflightCertFetch) {
    inflightCertFetch = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      try {
        const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new AuthTokenError(
            'AUTH_KEY_FETCH_FAILED',
            `Gagal mengambil sertifikat publik Google (HTTP ${res.status}).`,
            503
          );
        }
        const data = (await res.json()) as Record<string, unknown>;
        const certs: Record<string, string> = {};
        for (const [kid, pem] of Object.entries(data)) {
          if (typeof pem === 'string' && pem.includes('BEGIN CERTIFICATE')) {
            certs[kid] = pem;
          }
        }
        if (Object.keys(certs).length === 0) {
          throw new AuthTokenError(
            'AUTH_KEY_FETCH_FAILED',
            'Daftar sertifikat publik Google kosong atau tidak valid.',
            503
          );
        }
        const ttlMs = parseMaxAgeMs(res.headers.get('cache-control'));
        certCache = {
          certs,
          fetchedAt: Date.now(),
          expiresAt: Date.now() + ttlMs,
        };
        return certs;
      } catch (err) {
        if (err instanceof AuthTokenError) {
          throw err;
        }
        // Fallback to stale cached certs briefly if Google endpoint has transient network glitch
        if (certCache && Object.keys(certCache.certs).length > 0) {
          return certCache.certs;
        }
        throw new AuthTokenError(
          'AUTH_KEY_FETCH_FAILED',
          'Gagal menghubungi server sertifikat autentikasi Google. Periksa koneksi jaringan server.',
          503
        );
      } finally {
        clearTimeout(timeoutId);
        inflightCertFetch = null;
      }
    })();
  }

  return inflightCertFetch;
}

function decodeBase64UrlJson<T>(segment: string): T {
  try {
    const jsonStr = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid JWT JSON object');
    }
    return parsed as T;
  } catch {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Format token autentikasi rusak atau tidak valid.',
      401
    );
  }
}

async function verifyIdTokenWithGoogleCerts(
  idToken: string,
  expectedProjectId: string
): Promise<DecodedFirebaseToken> {
  if (!expectedProjectId) {
    throw new AuthTokenError(
      'AUTH_CONFIG_MISSING',
      'Konfigurasi FIREBASE_PROJECT_ID belum diatur pada server backend.',
      500
    );
  }

  if (typeof idToken !== 'string' || idToken.length < 32 || idToken.length > 16384) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Token autentikasi tidak valid. Silakan login ulang.',
      401
    );
  }

  const segments = idToken.split('.');
  if (segments.length !== 3 || !segments[0] || !segments[1] || !segments[2]) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Format JWT tidak valid. Silakan login ulang.',
      401
    );
  }

  const [headerSeg, payloadSeg, signatureSeg] = segments;

  const header = decodeBase64UrlJson<{ alg?: unknown; kid?: unknown }>(headerSeg);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid.trim()) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Algoritma atau Key ID token autentikasi tidak valid.',
      401
    );
  }

  const payload = decodeBase64UrlJson<Record<string, unknown>>(payloadSeg);

  // Check audience first so project mismatch produces an unmistakable diagnostic
  if (typeof payload.aud !== 'string' || !payload.aud.trim()) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Klaim audience (aud) pada token tidak ditemukan.',
      401
    );
  }
  if (payload.aud !== expectedProjectId) {
    throw new AuthTokenError(
      'AUTH_PROJECT_MISMATCH',
      'Konfigurasi FIREBASE_PROJECT_ID di server tidak sesuai dengan project Firebase pada aplikasi web.',
      500
    );
  }

  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Issuer token autentikasi tidak sesuai dengan project Firebase.',
      401
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Waktu kedaluwarsa token tidak valid.',
      401
    );
  }
  if (payload.exp <= nowSec - 10) {
    throw new AuthTokenError(
      'AUTH_TOKEN_EXPIRED',
      'Sesi telah kedaluwarsa. Silakan login kembali.',
      401
    );
  }

  if (
    typeof payload.iat !== 'number' ||
    !Number.isFinite(payload.iat) ||
    payload.iat > nowSec + 60
  ) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Waktu penerbitan token (iat) tidak valid.',
      401
    );
  }

  if (
    payload.auth_time !== undefined &&
    (typeof payload.auth_time !== 'number' ||
      !Number.isFinite(payload.auth_time) ||
      payload.auth_time > nowSec + 60)
  ) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Waktu autentikasi token (auth_time) tidak valid.',
      401
    );
  }

  if (
    typeof payload.sub !== 'string' ||
    payload.sub.trim().length === 0 ||
    payload.sub.length > 128
  ) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Identitas pengguna (sub/uid) pada token tidak valid.',
      401
    );
  }

  // Retrieve Google X.509 certificates (refresh once if kid recently rotated)
  let certs = await fetchGooglePublicCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await fetchGooglePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Sertifikat penandatangan token tidak dikenali atau sudah tidak berlaku. Silakan login ulang.',
      401
    );
  }

  // Cryptographically verify RS256 signature against Google's X.509 certificate
  let isSignatureValid = false;
  try {
    const signatureBytes = Buffer.from(signatureSeg, 'base64url');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerSeg}.${payloadSeg}`);
    verifier.end();
    isSignatureValid = verifier.verify(certPem, signatureBytes);
  } catch {
    isSignatureValid = false;
  }

  if (!isSignatureValid) {
    throw new AuthTokenError(
      'AUTH_INVALID_TOKEN',
      'Verifikasi tanda tangan token gagal. Silakan login ulang.',
      401
    );
  }

  return {
    ...payload,
    uid: payload.sub,
    sub: payload.sub,
    aud: payload.aud,
    iss: payload.iss,
    iat: payload.iat,
    exp: payload.exp,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified:
      typeof payload.email_verified === 'boolean'
        ? payload.email_verified
        : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}

export async function verifyFirebaseIdToken(
  idToken: string,
  checkRevoked = false
): Promise<DecodedFirebaseToken> {
  const projectId = resolveServerFirebaseProjectId();
  const decoded = await verifyIdTokenWithGoogleCerts(idToken, projectId);

  // Optional revocation check when service account JSON is explicitly configured
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (checkRevoked && serviceAccountRaw) {
    try {
      const { cert, getApps, initializeApp } = await import('firebase-admin/app');
      const { getAuth } = await import('firebase-admin/auth');
      if (!getApps().length) {
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
          projectId: parsedCred.project_id || projectId,
        });
      }
      await getAuth().verifyIdToken(idToken, true);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/id-token-revoked' || code === 'auth/user-disabled') {
        throw new AuthTokenError(
          'AUTH_INVALID_TOKEN',
          'Sesi akun telah dicabut atau dinonaktifkan. Silakan login kembali.',
          401
        );
      }
      // If runtime is Node <22 where firebase-admin throws ERR_REQUIRE_ESM, keep verified X.509 result
    }
  }

  return decoded;
}

export const adminAuth = {
  verifyIdToken: (idToken: string, checkRevoked?: boolean) =>
    verifyFirebaseIdToken(idToken, checkRevoked),
};
