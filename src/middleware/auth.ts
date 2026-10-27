import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, serverFirebaseProjectId } from '../lib/firebase-admin.ts';
import { isDatabaseConfigured } from '../db/index.ts';
import { HttpError, syncAuthenticatedUser } from '../db/repository.ts';
import type { UserProfile, UserRole } from '../types/workshop.ts';

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  dbUser?: UserProfile;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.',
      code: 'AUTH_MISSING_TOKEN',
    });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({
      error: 'Token autentikasi kosong. Silakan login ulang.',
      code: 'AUTH_EMPTY_TOKEN',
    });
    return;
  }

  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch (authErr) {
    const errMsg = authErr instanceof Error ? authErr.message : 'Invalid token';
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[WorkshopTrack Auth Middleware Debug] Gagal verifikasi token:', {
        path: req.originalUrl,
        projectId: serverFirebaseProjectId,
        reason: errMsg,
      });
    }

    if (errMsg.includes('incorrect "aud" (audience) claim')) {
      res.status(500).json({
        error:
          'Konfigurasi FIREBASE_PROJECT_ID di server tidak sesuai dengan project Firebase di aplikasi web.',
        code: 'AUTH_PROJECT_MISMATCH',
      });
      return;
    }

    res.status(401).json({
      error: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login ulang.',
      code: 'AUTH_INVALID_TOKEN',
    });
    return;
  }

  if (!decoded.email) {
    res.status(401).json({
      error: 'Akun Google tidak memiliki alamat email yang valid.',
      code: 'AUTH_MISSING_EMAIL',
    });
    return;
  }

  if (!isDatabaseConfigured()) {
    res.status(503).json({
      error:
        'Konfigurasi database server (SQL_HOST, SQL_USER, SQL_DB_NAME) belum diatur pada Environment Variables backend.',
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
      res.status(403).json({
        error:
          'Akun Anda sedang dinonaktifkan oleh Admin Workshop. Hubungi administrator.',
        code: 'USER_INACTIVE',
      });
      return;
    }

    req.firebaseUser = decoded;
    req.dbUser = dbUser;
    next();
  } catch (dbErr) {
    if (dbErr instanceof HttpError) {
      res.status(dbErr.statusCode).json({ error: dbErr.message });
      return;
    }
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        '[WorkshopTrack DB Sync Debug] Gagal sinkronisasi profil pengguna ke PostgreSQL:',
        dbErr instanceof Error ? dbErr.message : 'Unknown database error'
      );
    }
    res.status(503).json({
      error:
        'Autentikasi Google berhasil, tetapi server gagal terhubung ke database PostgreSQL. Periksa variabel SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, dan SQL_SSL.',
      code: 'DB_SYNC_FAILED',
    });
  }
};

export const requireRoles = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.dbUser;
    if (!user) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Akses ditolak: Peran "${user.role}" tidak memiliki izin untuk tindakan ini.`,
      });
      return;
    }
    next();
  };
};
