import React, { useEffect, useState } from 'react';
import { Download, FileText, QrCode, X } from 'lucide-react';
import {
  downloadQrLabelPng,
  downloadQrLabelsPdf,
  formatIndonesianShortDate,
  generateQrCodeDataUrl,
  PrintableQrItem,
} from '../lib/qrUtils';
import { useAuth } from '../context/AuthContext';

interface QrLabelModalProps {
  items: PrintableQrItem[];
  itemIds?: number[];
  title?: string;
  onClose: () => void;
}

export const QrLabelModal: React.FC<QrLabelModalProps> = ({
  items,
  itemIds,
  title = 'Label QR Code Barang',
  onClose,
}) => {
  const { apiFetch } = useAuth();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const activeItem = items[selectedIndex] || items[0];

  useEffect(() => {
    if (!activeItem) return;
    let cancelled = false;
    generateQrCodeDataUrl(activeItem.qrToken, 280).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [activeItem]);

  if (!activeItem) return null;

  const logReprint = async () => {
    const id = itemIds?.[selectedIndex];
    if (id) {
      try {
        await apiFetch(`/api/items/${id}/reprint-log`, {
          method: 'POST',
          body: JSON.stringify({ itemCode: activeItem.itemCode }),
        });
      } catch {
        // Non-blocking audit call
      }
    }
  };

  const handleDownloadPng = async () => {
    setBusy(true);
    try {
      await downloadQrLabelPng(activeItem);
      await logReprint();
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdfSingle = async () => {
    setBusy(true);
    try {
      await downloadQrLabelsPdf([activeItem], `Label-${activeItem.itemCode}.pdf`);
      await logReprint();
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadPdfAll = async () => {
    setBusy(true);
    try {
      await downloadQrLabelsPdf(
        items,
        `Label-WorkOrder-${activeItem.woNumber}.pdf`
      );
      await logReprint();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-industrial-600" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {items.length > 1 && (
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
              {items.map((it, idx) => (
                <button
                  key={it.itemCode}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    idx === selectedIndex
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {it.itemCode} · {it.itemName}
                </button>
              ))}
            </div>
          )}

          {/* Printable Industrial Tag Preview */}
          <div className="border-2 border-navy-900 bg-white text-slate-900 rounded-xl overflow-hidden">
            <div className="bg-navy-900 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="font-display font-bold tracking-tight text-sm">
                WORKSHOPTRACK
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums">
                {activeItem.woNumber}
              </span>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
              <div className="sm:col-span-7 space-y-2.5 text-left">
                <div>
                  <p className="text-[11px] text-slate-500">Kode Barang</p>
                  <p className="font-mono text-sm font-bold text-slate-900 tabular-nums">
                    {activeItem.itemCode}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Nama Komponen</p>
                  <p className="text-sm font-semibold text-slate-900">
                    Item: {activeItem.itemName}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500">Customer</p>
                  <p className="text-xs font-medium text-slate-800">
                    Customer: {activeItem.companyName}
                  </p>
                </div>
                <div className="pt-1 border-t border-slate-200">
                  <p className="font-mono text-xs font-semibold text-navy-900 tabular-nums">
                    Received: {formatIndonesianShortDate(activeItem.receivedAt)}
                  </p>
                </div>
              </div>

              <div className="sm:col-span-5 flex flex-col items-center justify-center">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR ${activeItem.itemCode}`}
                    className="w-36 h-36 border border-slate-200 p-1.5 rounded-lg bg-white"
                  />
                ) : (
                  <div className="w-36 h-36 border border-slate-200 rounded-lg animate-pulse bg-slate-100" />
                )}
                <span className="mt-1.5 font-mono text-[10px] text-slate-500 tabular-nums">
                  {activeItem.qrToken}
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            QR Code berisi token acak terenkripsi yang hanya dapat diakses setelah pengguna login sesuai hak akses.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadPng}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Unduh PNG</span>
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadPdfSingle}
              className="min-h-[44px] px-4 py-2 rounded-lg bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4" />
              <span>Cetak Label PDF</span>
            </button>

            {items.length > 1 && (
              <button
                type="button"
                disabled={busy}
                onClick={handleDownloadPdfAll}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <FileText className="w-4 h-4" />
                <span>Cetak Semua ({items.length}) PDF</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
