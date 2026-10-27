import type { Request, Response, NextFunction } from 'express';
import {
  adminAuth,
  AuthTokenError,
  type DecodedFirebaseToken,
  resolveServerFirebaseProjectId,
} from '../lib/firebase-admin.ts';
import {
  extractPgErrorCode,
  getDatabaseDiagnostics,
  sanitizeSecretErrorText,
} from '../db/index.ts';
import { HttpError, syncAuthenticatedUser } from '../db/repository.ts';
import type { UserProfile, UserRole } from '../types/workshop.ts';

export const SESSION_COOKIE_NAME = 'wt_session';
const SESSION_MAX_AGE_SECONDS = 3600; // 1 hour matching Firebase ID token lifetime

export interface AuthRequest extends Request {
  firebaseUser?: DecodedFirebaseToken;
  dbUser?: UserProfile;
  authToken?: string;
  authSource?: 'bearer' | 'cookie';
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) {
    return true;
  }
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
}

export function parseCookieValue(
  cookieHeader: string | undefined,
  targetName: string
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }
  const pairs = cookieHeader.split(';');
  for (const rawPair of pairs) {
    const eqIndex = rawPair.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = rawPair.slice(0, eqIndex).trim();
    if (key !== targetName) {
      continue;
    }
    const rawVal = rawPair.slice(eqIndex + 1).trim();
    if (!rawVal) {
      return null;
    }
    try {
      return decodeURIComponent(rawVal);
    } catch {
      return rawVal;
    }
  }
  return null;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string
): void {
  if (res.headersSent || !token) {
    return;
  }
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  if (res.headersSent) {
    return;
  }
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function extractRequestToken(req: Request): {
  token: string | null;
  source: 'bearer' | 'cookie' | 'none';
  explicitEmptyBearer: boolean;
} {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.trim().length > 0) {
    const match = /^Bearer\s*(.*)$/i.exec(authHeader.trim());
    if (match) {
      const candidate = match[1].trim();
      if (!candidate) {
        return { token: null, source: 'none', explicitEmptyBearer: true };
      }
      return { token: candidate, source: 'bearer', explicitEmptyBearer: false };
    }
  }

  const cookieToken = parseCookieValue(req.headers.cookie, SESSION_COOKIE_NAME);
  if (cookieToken && cookieToken.trim().length > 0) {
    return {
      token: cookieToken.trim(),
      source: 'cookie',
      explicitEmptyBearer: false,
    };
  }

  return { token: null, source: 'none', explicitEmptyBearer: false };
}

function buildDatabaseFailureMessage(pgCode: string): string {
  if (pgCode === '28P01' || pgCode === '28000') {
    return 'Autentikasi Google berhasil, tetapi kredensial login database PostgreSQL (user/password pada DATABASE_URL atau SQL_PASSWORD) ditolak oleh server database.';
  }
  if (pgCode === '3D000') {
    return 'Autentikasi Google berhasil, tetapi nama database PostgreSQL (SQL_DB_NAME atau path DATABASE_URL) tidak ditemukan.';
  }
  if (
    pgCode === 'ENOTFOUND' ||
    pgCode === 'EAI_AGAIN' ||
    pgCode === 'ECONNREFUSED' ||
    pgCode === 'ETIMEDOUT'
  ) {
    return 'Autentikasi Google berhasil, tetapi server gagal menjangkau host database PostgreSQL. Pastikan DATABASE_URL (mis. Supabase Pooler) atau SQL_HOST dapat diakses publik dari Vercel.';
  }
  if (
    pgCode === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    pgCode === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    pgCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
  ) {
    return 'Autentikasi Google berhasil, tetapi koneksi TLS/SSL ke PostgreSQL gagal diverifikasi. Pastikan SQL_SSL=true pada Environment Variables.';
  }
  return 'Autentikasi Google berhasil, tetapi server gagal terhubung ke database PostgreSQL. Periksa variabel DATABASE_URL atau SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, dan SQL_SSL pada Production Environment.';
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { token, source, explicitEmptyBearer } = extractRequestToken(req);

    if (explicitEmptyBearer) {
      res.status(401).json({
        authenticated: false,
        user: null,
        error: 'Token autentikasi kosong. Silakan login ulang.',
        code: 'AUTH_EMPTY_TOKEN',
      });
      return;
    }

    if (!token) {
      res.status(401).json({
        authenticated: false,
        user: null,
        error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.',
        code: 'AUTH_MISSING_TOKEN',
      });
      return;
    }

    let decoded: DecodedFirebaseToken;
    try {
      decoded = await adminAuth.verifyIdToken(token);
    } catch (authErr) {
      if (source === 'cookie') {
        clearSessionCookie(req, res);
      }

      if (authErr instanceof AuthTokenError) {
        console.warn('[WorkshopTrack Auth] Verifikasi token ditolak:', {
          path: req.originalUrl || req.url,
          code: authErr.code,
          status: authErr.statusCode,
          source,
          projectId: resolveServerFirebaseProjectId() || '(unset)',
        });

        res.status(authErr.statusCode).json({
          authenticated: false,
          user: null,
          error: authErr.message,
          code: authErr.code,
        });
        return;
      }

      const safeReason =
        authErr instanceof Error
          ? sanitizeSecretErrorText(authErr.message)
          : 'Invalid authentication token';

      console.warn('[WorkshopTrack Auth] Gagal memvalidasi token:', {
        path: req.originalUrl || req.url,
        source,
        projectId: resolveServerFirebaseProjectId() || '(unset)',
        reason: safeReason,
      });

      res.status(401).json({
        authenticated: false,
        user: null,
        error: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login ulang.',
        code: 'AUTH_INVALID_TOKEN',
      });
      return;
    }

    if (!decoded.email || !decoded.email.trim()) {
      res.status(401).json({
        authenticated: false,
        user: null,
        error: 'Akun Google tidak memiliki alamat email yang valid.',
        code: 'AUTH_MISSING_EMAIL',
      });
      return;
    }

    const dbDiag = getDatabaseDiagnostics();
    if (dbDiag.invalidCloudSqlSocketOnVercel) {
      console.error(
        '[WorkshopTrack Auth] SQL_HOST menggunakan Unix socket /cloudsql/ pada environment Vercel yang tidak mendukung Cloud SQL Proxy lokal.'
      );
      res.status(503).json({
        authenticated: false,
        user: null,
        error:
          'Variabel SQL_HOST saat ini berisi path socket internal (/cloudsql/...) yang tidak tersedia di Vercel. Gunakan DATABASE_URL (mis. Supabase / Neon PostgreSQL) atau alamat host TCP publik pada Vercel Production Environment Variables.',
        code: 'DB_INVALID_VERCEL_SOCKET',
      });
      return;
    }

    if (!dbDiag.configured) {
      console.error(
        '[WorkshopTrack Auth] Konfigurasi database belum diatur pada environment server (DATABASE_URL maupun SQL_HOST/SQL_USER/SQL_DB_NAME kosong).'
      );
      res.status(503).json({
        authenticated: false,
        user: null,
        error:
          'Konfigurasi database server belum diatur pada Production Environment Variables. Tambahkan DATABASE_URL (Supabase / PostgreSQL) atau variabel SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, dan SQL_SSL di Vercel.',
        code: 'DB_NOT_CONFIGURED',
      });
      return;
    }

    try {
      const dbUser = await syncAuthenticatedUser(
        decoded.uid,
        decoded.email,
        decoded.name
      );

      if (!dbUser.isActive) {
        clearSessionCookie(req, res);
        res.status(403).json({
          authenticated: false,
          user: null,
          error:
            'Akun Anda sedang dinonaktifkan oleh Admin Workshop. Hubungi administrator.',
          code: 'USER_INACTIVE',
        });
        return;
      }

      req.firebaseUser = decoded;
      req.dbUser = dbUser;
      req.authToken = token;
      req.authSource = source === 'none' ? undefined : source;
      next();
    } catch (dbErr) {
      if (dbErr instanceof HttpError) {
        res.status(dbErr.statusCode).json({
          authenticated: false,
          user: null,
          error: dbErr.message,
        });
        return;
      }

      const pgCode = extractPgErrorCode(dbErr);
      const safeMsg =
        dbErr instanceof Error
          ? sanitizeSecretErrorText(dbErr.message)
          : 'Unknown database error';

      console.error('[WorkshopTrack Auth] Gagal sinkronisasi profil pengguna ke PostgreSQL:', {
        path: req.originalUrl || req.url,
        dbMode: dbDiag.mode,
        pgCode: pgCode || 'UNKNOWN',
        reason: safeMsg,
      });

      res.status(503).json({
        authenticated: false,
        user: null,
        error: buildDatabaseFailureMessage(pgCode),
        code: 'DB_SYNC_FAILED',
      });
    }
  } catch (unexpectedErr) {
    const safeMsg =
      unexpectedErr instanceof Error
        ? sanitizeSecretErrorText(unexpectedErr.message)
        : 'Unexpected auth middleware error';
    console.error('[WorkshopTrack Auth] Kesalahan tak terduga pada middleware autentikasi:', {
      path: req.originalUrl || req.url,
      reason: safeMsg,
    });
    if (!res.headersSent) {
      res.status(500).json({
        authenticated: false,
        user: null,
        error: 'Terjadi gangguan internal saat memverifikasi sesi pengguna.',
        code: 'AUTH_INTERNAL_ERROR',
      });
    }
  }
};

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.dbUser;
    if (!user) {
      res.status(401).json({
        authenticated: false,
        error: 'Autentikasi diperlukan.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Akses ditolak: Peran "${user.role}" tidak memiliki izin untuk tindakan ini.`,
        code: 'FORBIDDEN_ROLE',
      });
      return;
    }
    next();
  };
};
