import React, { useState } from 'react';
import { LogIn, QrCode, ShieldCheck, Wrench } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallPrompt';
import heroWorkshopImg from '../assets/images/workshop_cnc_crankshaft_1793072947940.jpg';

interface LoginScreenProps {
  pendingQrToken?: string | null;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ pendingQrToken }) => {
  const { signInWithGoogle, authError } = useAuth();
  const [imgError, setImgError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark flex flex-col lg:grid lg:grid-cols-12 items-stretch">
      {/* Left Visual Industrial Hero Column */}
      <div className="relative lg:col-span-7 min-h-[280px] lg:min-h-screen bg-navy-950 overflow-hidden flex flex-col justify-between">
        {!imgError ? (
          <img
            src={heroWorkshopImg}
            alt="Fasilitas pemesinan dan perbaikan crankshaft industri WorkshopTrack"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover opacity-75"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-slate-900 flex items-center justify-center">
            <Wrench className="w-24 h-24 text-slate-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-slate-950/30" />

        <div className="relative z-10 p-6 sm:p-10">
          <div className="flex items-center gap-3 text-white">
            <div className="w-10 h-10 rounded-xl bg-industrial-600 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-display text-xl font-bold tracking-tight block leading-none">
                WorkshopTrack
              </span>
              <span className="text-[11px] font-semibold tracking-wider text-blue-300 uppercase">
                PT TJOKRO BERSAUDARA
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-10 max-w-2xl space-y-4">
          <h1 className="font-display text-2xl sm:text-4xl font-bold text-white leading-tight">
            Manajemen Pelacakan Perbaikan Komponen Industri Berbasis QR Code
          </h1>
          <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
            Pantau penerimaan Work Order, inspeksi awal, pergerakan antar-area mesin, progres teknisi harian, hingga Quality Control secara real-time di seluruh perangkat workshop.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            <span>Penerimaan Work Order</span>
            <span aria-hidden="true">·</span>
            <span>Label & Scanner QR</span>
            <span aria-hidden="true">·</span>
            <span>Pelacakan 11 Area Workshop</span>
            <span aria-hidden="true">·</span>
            <span>Laporan Excel & PDF</span>
          </div>
        </div>
      </div>

      {/* Right Authentication Column */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-12 bg-white dark:bg-surface-dark">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wider uppercase text-industrial-600">
              PT TJOKRO BERSAUDARA · Portal Web (PWA)
            </p>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              Masuk ke WorkshopTrack
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Gunakan akun kerja yang terdaftar untuk mengakses data barang, memindai QR Code via kamera browser, dan memperbarui tahapan pengerjaan secara real-time.
            </p>
          </div>

          {pendingQrToken && (
            <div className="p-4 rounded-xl border border-industrial-600/30 bg-blue-50/70 dark:bg-blue-950/30 space-y-1">
              <p className="text-xs font-semibold text-industrial-700 dark:text-blue-300">
                Pemindaian QR Code Terdeteksi
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300">
                Token <span className="font-mono font-semibold">{pendingQrToken}</span> siap dibuka otomatis segera setelah Anda login.
              </p>
            </div>
          )}

          {authError && (
            <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {authError}
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={submitting}
              onClick={handleLogin}
              className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-navy-900 hover:bg-navy-800 text-white font-medium text-sm transition-colors flex items-center justify-center gap-3 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>{submitting ? 'Memverifikasi Akun...' : 'Masuk dengan Akun Google'}</span>
            </button>

            <PWAInstallButton variant="login" />
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <ShieldCheck className="w-4 h-4 text-industrial-600" />
              <span>Sistem Otorisasi Berbasis Peran (RBAC)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-slate-200">01. Admin</p>
                <p>Registrasi barang masuk, cetak QR, kelola customer & akun staf.</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-slate-200">02. Supervisor</p>
                <p>Penugasan teknisi, prioritas WO, dan persetujuan inspeksi/QC.</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-slate-200">03. Teknisi</p>
                <p>Scan QR, update status, pindah lokasi & unggah foto progres.</p>
              </div>
              <div className="space-y-0.5">
                <p className="font-semibold text-slate-900 dark:text-slate-200">04. Manajemen</p>
                <p>Monitoring produktivitas real-time, histori & ekspor laporan.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
