import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  ArrowRight,
  Camera,
  CameraOff,
  Flashlight,
  ImageUp,
  Keyboard,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';
import { STATUS_LABELS, WorkOrderItemSummary } from '../types/workshop';
import { extractQrIdentifier } from '../lib/qrUtils';

interface QrScannerViewProps {
  items: WorkOrderItemSummary[];
  onResolveIdentifier: (identifier: string) => Promise<void>;
  onSelectItem: (itemId: number) => void;
}

export const QrScannerView: React.FC<QrScannerViewProps> = ({
  items,
  onResolveIdentifier,
  onSelectItem,
}) => {
  const [mode, setMode] = useState<'camera' | 'external' | 'manual'>('camera');
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [externalCode, setExternalCode] = useState('');
  const [manualQuery, setManualQuery] = useState('');
  const [resolving, setResolving] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const externalInputRef = useRef<HTMLInputElement | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleDecoded = useCallback(
    async (rawText: string) => {
      const token = extractQrIdentifier(rawText);
      if (!token || resolving) return;
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(60);
        } catch {
          // Ignore vibration restriction
        }
      }
      stopCamera();
      setResolving(true);
      setScanError(null);
      try {
        await onResolveIdentifier(token);
      } catch (err) {
        setScanError(
          err instanceof Error
            ? err.message
            : 'QR Code tidak dikenali dalam database WorkshopTrack.'
        );
      } finally {
        setResolving(false);
      }
    },
    [onResolveIdentifier, resolving, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setScanError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser tidak mendukung akses kamera langsung.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && 'getCapabilities' in videoTrack) {
        const caps = videoTrack.getCapabilities() as MediaTrackCapabilities & {
          torch?: boolean;
        };
        setTorchSupported(Boolean(caps?.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const scanFrame = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });
            if (code && code.data) {
              handleDecoded(code.data);
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(scanFrame);
      };

      rafRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setCameraActive(false);
      setScanError(
        'Kamera tidak dapat diakses. Pastikan website dibuka melalui koneksi aman (HTTPS) dan izin kamera diaktifkan pada browser, atau gunakan Unggah Foto QR / Pencarian Manual di bawah.'
      );
    }
  }, [facingMode, handleDecoded, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  useEffect(() => {
    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
      if (mode === 'external') {
        window.setTimeout(() => externalInputRef.current?.focus(), 100);
      }
    }
    return () => stopCamera();
  }, [mode, facingMode, startCamera, stopCamera]);

  const handleImageFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (decoded && decoded.data) {
          handleDecoded(decoded.data);
        } else {
          setScanError(
            'QR Code tidak terbaca pada foto yang dipilih. Pastikan label QR terlihat tajam dan terang.'
          );
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleExternalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!externalCode.trim()) return;
    const raw = externalCode;
    setExternalCode('');
    await handleDecoded(raw);
  };

  const manualResults = items.filter((it) => {
    if (!manualQuery.trim()) return true;
    const q = manualQuery.toLowerCase();
    return (
      it.itemCode.toLowerCase().includes(q) ||
      it.woNumber.toLowerCase().includes(q) ||
      it.itemName.toLowerCase().includes(q) ||
      it.companyName.toLowerCase().includes(q) ||
      it.serialNumber.toLowerCase().includes(q) ||
      it.qrToken.toLowerCase().includes(q)
    );
  });

  const activeShopFloorItems = items
    .filter((i) => !['DELIVERED', 'CANCELLED'].includes(i.currentStatus))
    .slice(0, 6);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Pemindai Cepat QR Code Workshop
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Pindai label QR pada komponen untuk langsung memperbarui progres perbaikan dan mencatat perpindahan lokasi area mesin secara real-time.
        </p>
      </div>

      {/* Interactive Segmented Mode Selector */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
        <button
          type="button"
          onClick={() => setMode('camera')}
          className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'camera'
              ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Camera className="w-4 h-4" />
          <span>Kamera Smartphone</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('external')}
          className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'external'
              ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          <span>Scanner Eksternal</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex-1 min-h-[44px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            mode === 'manual'
              ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Pencarian Manual</span>
        </button>
      </div>

      {scanError && (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
          {scanError}
        </div>
      )}

      {mode === 'camera' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-slate-950 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Frame */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
              <div className="w-56 h-56 sm:w-64 sm:h-64 rounded-2xl border-2 border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]" />
            </div>

            {!cameraActive && (
              <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center p-6 text-center space-y-3">
                <CameraOff className="w-10 h-10 text-slate-400" />
                <p className="text-sm text-slate-200 font-medium">
                  Pratinjau kamera browser belum aktif
                </p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-industrial-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Aktifkan Kamera Sekarang
                </button>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) =>
                    prev === 'environment' ? 'user' : 'environment'
                  )
                }
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Ganti Kamera</span>
              </button>

              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                    torchOn
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                      : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <Flashlight className="w-4 h-4" />
                  <span>{torchOn ? 'Matikan Senter' : 'Senter Kamera'}</span>
                </button>
              )}

              <label className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                <ImageUp className="w-4 h-4 text-industrial-600" />
                <span>Ambil / Unggah Foto QR</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFileScan}
                  className="hidden"
                />
              </label>
            </div>

            <span className="text-xs text-slate-500">
              {resolving
                ? 'Memuat detail barang...'
                : 'Otomatis membuka panel aksi cepat saat terbaca'}
            </span>
          </div>
        </div>
      )}

      {mode === 'external' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Mode Scanner QR / Barcode Eksternal (USB / Bluetooth HID)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pastikan kursor berada pada kolom input di bawah, lalu tembakkan alat scanner QR fisik ke label barang.
            </p>
          </div>

          <form onSubmit={handleExternalSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              ref={externalInputRef}
              type="text"
              autoFocus
              value={externalCode}
              onChange={(e) => setExternalCode(e.target.value)}
              placeholder="Tempel atau tembakkan hasil bacaan scanner di sini..."
              className="flex-1 min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={resolving}
              className="min-h-[48px] px-6 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold whitespace-nowrap cursor-pointer"
            >
              Buka Barang
            </button>
          </form>
        </div>
      )}

      {mode === 'manual' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Pencarian Manual Barang (Jika Label QR Rusak)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cari berdasarkan Kode Barang (WO-2026-0001-01), Nomor Work Order, Nama Komponen, Serial Number, atau Nama Perusahaan.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={manualQuery}
              onChange={(e) => setManualQuery(e.target.value)}
              placeholder="Ketik kode WO, nama barang (Crankshaft), SN, atau nama perusahaan..."
              className="w-full min-h-[46px] pl-10 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
            />
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {manualResults.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                Tidak ada barang yang cocok dengan kata kunci pencarian.
              </p>
            ) : (
              manualResults.slice(0, 20).map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => onSelectItem(it.id)}
                  className="w-full py-3.5 px-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {it.itemName}{' '}
                      <span className="font-mono text-xs text-industrial-600 font-normal">
                        ({it.itemCode})
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {it.companyName} · Lokasi: {it.currentLocationName} · Teknisi: {it.leadTechnicianName}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
                    {STATUS_LABELS[it.currentStatus]}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Quick Shop-Floor Active Items Strip */}
      {mode !== 'manual' && activeShopFloorItems.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Akses Cepat Komponen Aktif di Lantai Workshop
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ketuk barang untuk langsung memperbarui progres atau mencatat perpindahan lokasi
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="text-xs font-semibold text-industrial-600 hover:underline whitespace-nowrap cursor-pointer"
            >
              Cari Semua ({items.length})
            </button>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeShopFloorItems.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onSelectItem(it.id)}
                className="w-full py-3 first:pt-1 last:pb-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {it.itemName}{' '}
                    <span className="font-mono text-xs text-industrial-600 font-normal tabular-nums">
                      {it.itemCode}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-industrial-600 shrink-0" />
                    <span className="truncate">
                      {it.currentLocationName} · {STATUS_LABELS[it.currentStatus]}
                    </span>
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
