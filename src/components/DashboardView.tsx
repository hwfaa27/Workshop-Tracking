import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Database,
  Filter,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  COMPONENT_TYPES,
  CustomerRecord,
  DashboardPayload,
  LocationRecord,
  MAIN_WORKFLOW_STATUSES,
  SPECIAL_STATUSES,
  STATUS_LABELS,
  UserProfile,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';

interface DashboardViewProps {
  customers: CustomerRecord[];
  locations: LocationRecord[];
  users: UserProfile[];
  onOpenItem: (itemId: number) => void;
  onOpenIncoming: () => void;
  onRefreshAll: () => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  customers,
  locations,
  users,
  onOpenItem,
  onOpenIncoming,
  onRefreshAll,
}) => {
  const { profile, apiFetch, subscribeSync } = useAuth();

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    customerId: '',
    technicianId: '',
    status: '',
    locationId: '',
    componentType: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.customerId) params.set('customerId', filters.customerId);
      if (filters.technicianId) params.set('technicianId', filters.technicianId);
      if (filters.status) params.set('status', filters.status);
      if (filters.locationId) params.set('locationId', filters.locationId);
      if (filters.componentType) params.set('componentType', filters.componentType);

      const query = params.toString();
      const res = await apiFetch<DashboardPayload>(
        `/api/dashboard${query ? `?${query}` : ''}`
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, filters]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    return subscribeSync(() => {
      loadDashboard();
    });
  }, [subscribeSync, loadDashboard]);

  const handleSeedSample = async () => {
    setSeeding(true);
    try {
      await apiFetch('/api/admin/seed-operational-sample', { method: 'POST' });
      await onRefreshAll();
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat contoh data.');
    } finally {
      setSeeding(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      customerId: '',
      technicianId: '',
      status: '',
      locationId: '',
      componentType: '',
    });
  };

  const technicians = users.filter((u) => u.role === 'TEKNISI');

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const kpis = data?.kpis || {
    totalIncoming: 0,
    inProgress: 0,
    waitingSparePart: 0,
    waitingApproval: 0,
    inQualityControl: 0,
    completedReady: 0,
    delivered: 0,
    overdue: 0,
  };

  const maxMonthly = Math.max(
    1,
    ...(data?.charts.monthlyIncoming.map((m) => m.count) || [1])
  );
  const maxWeekly = Math.max(
    1,
    ...(data?.charts.weeklyCompleted.map((w) => w.count) || [1])
  );

  return (
    <div className="space-y-6">
      {/* Corporate Identity & Dashboard Header */}
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium text-industrial-600 dark:text-blue-400">
            Divisi Pemesinan & Rekondisi Komponen Industri
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-navy-900 dark:text-white">
            PT TJOKRO BERSAUDARA
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            Monitoring Operasional Workshop · Statistik real-time status pengerjaan, kapasitas teknisi, dan ketepatan estimasi.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-xs sm:text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap"
          >
            <Filter className="w-4 h-4 text-industrial-600" />
            <span>Filter Data</span>
          </button>
        </div>
      </div>

      {/* Interactive Filter Panel */}
      {showFilters && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters({ ...filters, startDate: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters({ ...filters, endDate: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Customer
              </label>
              <select
                value={filters.customerId}
                onChange={(e) =>
                  setFilters({ ...filters, customerId: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="">Semua Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Teknisi
              </label>
              <select
                value={filters.technicianId}
                onChange={(e) =>
                  setFilters({ ...filters, technicianId: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="">Semua Teknisi</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Status Pengerjaan
              </label>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="">Semua Status</option>
                {[...MAIN_WORKFLOW_STATUSES, ...SPECIAL_STATUSES].map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Lokasi Workshop
              </label>
              <select
                value={filters.locationId}
                onChange={(e) =>
                  setFilters({ ...filters, locationId: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="">Semua Lokasi</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Jenis Komponen
              </label>
              <select
                value={filters.componentType}
                onChange={(e) =>
                  setFilters({ ...filters, componentType: e.target.value })
                }
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs"
              >
                <option value="">Semua Jenis Komponen</option>
                {COMPONENT_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={resetFilters}
                className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filter</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 8 KPI Metric Grid (Section 9) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 sm:gap-4">
        {[
          { label: 'Total Barang Masuk', value: kpis.totalIncoming, tone: 'text-slate-900 dark:text-white' },
          { label: 'Dalam Proses', value: kpis.inProgress, tone: 'text-industrial-600 dark:text-blue-400' },
          { label: 'Menunggu Spare Part', value: kpis.waitingSparePart, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Menunggu Approval', value: kpis.waitingApproval, tone: 'text-amber-600 dark:text-amber-400' },
          { label: 'Quality Control', value: kpis.inQualityControl, tone: 'text-industrial-600 dark:text-blue-400' },
          { label: 'Selesai Diperbaiki', value: kpis.completedReady, tone: 'text-green-600 dark:text-green-400' },
          { label: 'Sudah Dikirim', value: kpis.delivered, tone: 'text-green-600 dark:text-green-400' },
          { label: 'Melewati Estimasi', value: kpis.overdue, tone: kpis.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-4 sm:p-5 space-y-1.5"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className={`font-mono text-2xl sm:text-3xl font-bold tabular-nums ${stat.tone}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Empty State when DB has 0 items */}
      {kpis.totalIncoming === 0 && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-8 text-center space-y-4">
          <div className="space-y-1 max-w-lg mx-auto">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Database Workshop Siap Digunakan (Belum Ada Work Order)
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Dashboard menampilkan data asli dari PostgreSQL tanpa angka simulasi. Daftarkan barang masuk pertama atau muat contoh Work Order operasional nyata ke database untuk mencoba seluruh alur QR Code & pelacakan.
            </p>
          </div>

          {profile?.role === 'ADMIN' && (
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onOpenIncoming}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Daftarkan Barang Masuk Pertama</span>
              </button>

              <button
                type="button"
                disabled={seeding}
                onClick={handleSeedSample}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2 cursor-pointer"
              >
                <Database className="w-4 h-4 text-industrial-600" />
                <span>
                  {seeding
                    ? 'Membuat Work Order Contoh...'
                    : 'Muat Contoh Work Order (Crankshaft, dll.)'}
                </span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Overdue Alert List */}
      {data && data.overdueItems.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-red-200 dark:border-red-900/50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-sm font-semibold">
              Peringatan Pekerjaan Melewati Estimasi Selesai ({data.overdueItems.length} Barang)
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {data.overdueItems.map((ov) => (
              <button
                key={ov.id}
                type="button"
                onClick={() => onOpenItem(ov.id)}
                className="w-full py-3 text-left flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
              >
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {ov.itemName}
                  </span>{' '}
                  <span className="font-mono text-xs text-slate-500">
                    ({ov.itemCode})
                  </span>
                  <span className="text-slate-500">
                    {' '}· {ov.companyName} · Lokasi: {ov.currentLocationName}
                  </span>
                </div>
                <span className="font-mono text-xs text-red-600 font-semibold tabular-nums">
                  Target: {new Date(ov.estimatedCompletion).toLocaleDateString('id-ID')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5 Analytical Charts (Section 9) */}
      {data && kpis.totalIncoming > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Chart 1: Monthly Incoming */}
          <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Jumlah Barang Masuk per Bulan
              </h2>
              <p className="text-xs text-slate-500">Tren volume penerimaan komponen 6 bulan terakhir</p>
            </div>
            <div className="h-48 flex items-end justify-between gap-3 pt-4">
              {data.charts.monthlyIncoming.map((m) => {
                const heightPct = Math.max(6, Math.round((m.count / maxMonthly) * 100));
                return (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {m.count}
                    </span>
                    <div className="w-full max-w-[44px] bg-slate-100 dark:bg-slate-800 rounded-t-lg h-32 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-industrial-600 rounded-t-lg transition-transform duration-200"
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">
                      {m.month}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 2: Status Distribution */}
          <div className="lg:col-span-6 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Distribusi Status Pekerjaan
              </h2>
              <p className="text-xs text-slate-500">Proporsi komponen berdasarkan tahapan pengerjaan saat ini</p>
            </div>
            <div className="space-y-3">
              {data.charts.statusDistribution.map((s) => {
                const pct = Math.round((s.count / Math.max(1, kpis.totalIncoming)) * 100);
                return (
                  <div key={s.status} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {s.label}
                      </span>
                      <span className="font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                        {s.count} unit ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-navy-900 dark:bg-industrial-600 rounded-full"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chart 3: Technician Workload */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Workload Setiap Teknisi
              </h2>
              <p className="text-xs text-slate-500">Penugasan aktif vs pekerjaan selesai</p>
            </div>
            {data.charts.technicianWorkload.length === 0 ? (
              <p className="text-xs text-slate-500 py-6">Belum ada teknisi terdaftar.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.charts.technicianWorkload.map((tw) => (
                  <div key={tw.technicianId} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {tw.technicianName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{tw.specialization}</p>
                    </div>
                    <div className="text-right font-mono text-xs tabular-nums shrink-0">
                      <span className="text-industrial-600 font-semibold">{tw.activeCount} aktif</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-green-600">{tw.completedCount} selesai</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chart 4: Average Repair Duration */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Rata-rata Durasi Perbaikan
              </h2>
              <p className="text-xs text-slate-500">Durasi pengerjaan per kategori komponen (hari)</p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {data.charts.avgRepairDuration.map((dur) => (
                <div key={dur.componentType} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                    {dur.componentType}
                  </span>
                  <span className="font-mono text-xs font-semibold text-slate-900 dark:text-white whitespace-nowrap tabular-nums">
                    {dur.avgDays} hari ({dur.completedCount})
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chart 5: Weekly Completed */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Pekerjaan Selesai per Minggu
              </h2>
              <p className="text-xs text-slate-500">Output penyelesaian 6 minggu terakhir</p>
            </div>
            <div className="h-36 flex items-end justify-between gap-2 pt-2">
              {data.charts.weeklyCompleted.map((w) => {
                const hPct = Math.max(8, Math.round((w.count / maxWeekly) * 100));
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="font-mono text-[11px] font-semibold tabular-nums">
                      {w.count}
                    </span>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-md h-24 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-green-600 rounded-t-md"
                        style={{ height: `${hPct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">
                      {w.week}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Recent Active Items Table */}
      {data && data.recentItems.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Daftar Barang Aktif Terbaru
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Kode Barang</th>
                  <th className="py-3 px-4 font-medium">Komponen & Customer</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Lokasi</th>
                  <th className="py-3 px-4 font-medium">Teknisi</th>
                  <th className="py-3 px-4 font-medium text-right">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {data.recentItems.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => onOpenItem(it.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-industrial-600 whitespace-nowrap tabular-nums">
                      {it.itemCode}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {it.itemName}
                      </p>
                      <p className="text-xs text-slate-500">{it.companyName}</p>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {STATUS_LABELS[it.currentStatus]}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {it.currentLocationName}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {it.leadTechnicianName}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                      {it.approvedStageProgress}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
