import React, { useCallback, useEffect, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { UserProfile } from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import {
  buildReportTable,
  exportReportToExcel,
  exportReportToPdf,
  ReportsBundleData,
  ReportTypeKey,
} from '../lib/exportUtils';

interface ReportsViewProps {
  users: UserProfile[];
}

const REPORT_TYPES: Array<{ id: ReportTypeKey; label: string }> = [
  { id: 'WORK_ORDERS', label: 'Laporan Work Order' },
  { id: 'ITEM_HISTORY', label: 'Riwayat Pekerjaan Barang' },
  { id: 'MOVEMENT_HISTORY', label: 'Riwayat Perpindahan Lokasi' },
  { id: 'TECHNICIAN_PRODUCTIVITY', label: 'Produktivitas Teknisi' },
  { id: 'MONTHLY_SUMMARY', label: 'Laporan Bulanan' },
];

export const ReportsView: React.FC<ReportsViewProps> = ({ users }) => {
  const { apiFetch, subscribeSync } = useAuth();
  const [selectedType, setSelectedType] = useState<ReportTypeKey>('WORK_ORDERS');
  const [bundle, setBundle] = useState<Omit<ReportsBundleData, 'users'> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const res = await apiFetch<Omit<ReportsBundleData, 'users'>>('/api/reports');
      setBundle(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data laporan.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    return subscribeSync(() => {
      loadReports();
    });
  }, [subscribeSync, loadReports]);

  const fullBundle: ReportsBundleData | null = bundle
    ? { ...bundle, users }
    : null;

  const preview = fullBundle
    ? buildReportTable(selectedType, fullBundle)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Laporan Operasional & Ekspor Data
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Unduh laporan resmi siap cetak dalam format Microsoft Excel (.xlsx) atau dokumen PDF.
          </p>
        </div>

        {fullBundle && (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => exportReportToExcel(selectedType, fullBundle)}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-green-600/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => exportReportToPdf(selectedType, fullBundle)}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Export PDF Siap Cetak</span>
            </button>
          </div>
        )}
      </div>

      {/* Report Type Selector */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            type="button"
            onClick={() => setSelectedType(rt.id)}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
              selectedType === rt.id
                ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {rt.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading && !preview ? (
        <div className="h-64 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 animate-pulse" />
      ) : (
        preview && (
          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {preview.title}
              </h2>
              <p className="text-xs text-slate-500">{preview.subtitle}</p>
            </div>

            {preview.rows.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                Belum ada rekaman data pada laporan ini.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="py-3 px-4 font-semibold whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {preview.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-3 px-4 text-slate-700 dark:text-slate-300 tabular-nums"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};
