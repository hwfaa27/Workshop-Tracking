import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { syncAuthenticatedUser } from '../db/repository.ts';
import { UserProfile, UserRole } from '../types/workshop.ts';

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
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) {
      res.status(401).json({ error: 'Akun Google tidak memiliki alamat email yang valid.' });
      return;
    }

    const dbUser = await syncAuthenticatedUser(
      decoded.uid,
      decoded.email,
      decoded.name
    );

    if (!dbUser.isActive) {
      res.status(403).json({
        error: 'Akun Anda sedang dinonaktifkan oleh Admin Workshop. Hubungi administrator.',
      });
      return;
    }

    req.firebaseUser = decoded;
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Sesi tidak valid atau telah kedaluwarsa. Silakan login ulang.' });
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
