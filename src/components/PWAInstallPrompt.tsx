import React, { useState } from 'react';
import { Download, Monitor, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'mobile-sheet' | 'login';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'sidebar',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Automatically hide install prompt when already running in standalone PWA mode
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  const buttonLabel = isInstallable
    ? 'Install Aplikasi (PWA)'
    : isIOS
    ? 'Tambah ke Layar Utama (iOS)'
    : 'Pasang Aplikasi Web (PWA)';

  return (
    <>
      {variant === 'sidebar' && (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[38px] px-3 py-2 rounded-lg bg-industrial-600/90 hover:bg-industrial-600 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{buttonLabel}</span>
        </button>
      )}

      {variant === 'mobile-sheet' && (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[48px] px-4 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 shrink-0" />
          <span>{buttonLabel}</span>
        </button>
      )}

      {variant === 'login' && (
        <button
          type="button"
          onClick={handleClick}
          className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Download className="w-4 h-4 text-industrial-600 shrink-0" />
          <span>{buttonLabel} — Akses Cepat Tanpa Browser Bar</span>
        </button>
      )}

      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5 text-slate-800 dark:text-slate-200 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Pasang WorkshopTrack (Add to Home Screen)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Jalankan WorkshopTrack layar penuh layaknya aplikasi di smartphone, tablet, maupun laptop.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-industrial-600 shrink-0" />
                  <span>Smartphone Android (Google Chrome / Edge)</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  1. Buka URL HTTPS aplikasi di tab utama Chrome.<br />
                  2. Ketuk ikon menu tiga titik di kanan atas browser.<br />
                  3. Pilih <strong>Tambahkan ke layar utama (Add to Home screen)</strong> atau <strong>Install aplikasi</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Share className="w-4 h-4 text-industrial-600 shrink-0" />
                  <span>iPhone & iPad (Safari iOS)</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  1. Ketuk tombol <strong>Bagikan (Share)</strong> pada bilah bawah Safari.<br />
                  2. Gulir ke bawah dan ketuk <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>, lalu ketuk <strong>Tambah</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-industrial-600 shrink-0" />
                  <span>Desktop & Laptop (Chrome / Edge)</span>
                </p>
                <p className="text-slate-600 dark:text-slate-300">
                  Klik ikon <strong>Install WorkshopTrack</strong> di sisi kanan bilah alamat (address bar) browser untuk memasang shortcut aplikasi di desktop.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-sm font-semibold cursor-pointer"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div className="fixed bottom-[72px] lg:bottom-5 left-4 right-4 sm:right-auto sm:max-w-md z-40 flex items-center gap-2.5 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-medium text-white shadow-lg">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Mode Offline — Antarmuka dimuat dari cache PWA. Hubungkan kembali internet untuk menyimpan perubahan database.
      </span>
    </div>
  );
};
