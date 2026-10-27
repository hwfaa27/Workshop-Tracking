import React, { useState } from 'react';
import { QrCode, Search } from 'lucide-react';
import {
  LocationRecord,
  MAIN_WORKFLOW_STATUSES,
  SPECIAL_STATUSES,
  STATUS_LABELS,
  WorkOrderItemSummary,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { PrintableQrItem, toPrintableQrItem } from '../lib/qrUtils';
import { QrLabelModal } from './QrLabelModal';

interface ItemsViewProps {
  items: WorkOrderItemSummary[];
  locations: LocationRecord[];
  onSelectItem: (itemId: number) => void;
}

export const ItemsView: React.FC<ItemsViewProps> = ({
  items,
  locations,
  onSelectItem,
}) => {
  const { profile } = useAuth();
  const [scope, setScope] = useState<'all' | 'mine'>(
    profile?.role === 'TEKNISI' ? 'mine' : 'all'
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [qrModalItem, setQrModalItem] = useState<{
    printable: PrintableQrItem;
    id: number;
  } | null>(null);

  const filtered = items.filter((it) => {
    if (
      scope === 'mine' &&
      profile &&
      !it.assignedTechnicianIds.includes(profile.id)
    ) {
      return false;
    }
    if (statusFilter && it.currentStatus !== statusFilter) return false;
    if (locationFilter && String(it.currentLocationId) !== locationFilter) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        it.itemCode.toLowerCase().includes(q) ||
        it.woNumber.toLowerCase().includes(q) ||
        it.itemName.toLowerCase().includes(q) ||
        it.companyName.toLowerCase().includes(q) ||
        it.serialNumber.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Daftar Barang & Pelacakan Komponen
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Klik baris barang untuk membuka detail teknis, memperbarui progres, memindahkan lokasi, atau mencetak ulang QR Code.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl">
          <button
            type="button"
            onClick={() => setScope('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'all'
                ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Semua Barang ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setScope('mine')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
              scope === 'mine'
                ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Ditugaskan ke Saya
          </button>
        </div>
      </div>

      {/* Search & Filter Row */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode barang, WO, nama komponen, SN, atau customer..."
            className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-sm"
          />
        </div>
        <div className="sm:col-span-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-xs sm:text-sm"
          >
            <option value="">Semua Status</option>
            {[...MAIN_WORKFLOW_STATUSES, ...SPECIAL_STATUSES].map((st) => (
              <option key={st} value={st}>
                {STATUS_LABELS[st]}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-xs sm:text-sm"
          >
            <option value="">Semua Lokasi Area</option>
            {locations.map((loc) => (
              <option key={loc.id} value={String(loc.id)}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Responsive Table / Mobile List */}
      <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Tidak ada barang yang sesuai dengan filter pencarian.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Kode & WO</th>
                  <th className="py-3 px-4 font-medium">Komponen & Customer</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Lokasi Saat Ini</th>
                  <th className="py-3 px-4 font-medium">Teknisi Utama</th>
                  <th className="py-3 px-4 font-medium text-right">Progress</th>
                  <th className="py-3 px-4 font-medium text-right">Label QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((it) => (
                  <tr
                    key={it.id}
                    onClick={() => onSelectItem(it.id)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <p className="font-mono text-xs font-bold text-industrial-600 tabular-nums">
                        {it.itemCode}
                      </p>
                      <p className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {it.woNumber}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {it.itemName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {it.companyName}
                        {it.serialNumber ? ` · SN: ${it.serialNumber}` : ''}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-xs font-semibold ${
                          it.currentStatus === 'DELIVERED' ||
                          it.currentStatus === 'READY_FOR_DELIVERY'
                            ? 'text-green-600'
                            : it.isOverdue
                            ? 'text-red-600'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {STATUS_LABELS[it.currentStatus]}
                      </span>
                      {it.isOverdue && (
                        <p className="text-[11px] text-red-600">Terlambat</p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {it.currentLocationName}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {it.leadTechnicianName}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                      {it.approvedStageProgress}%
                    </td>
                    <td
                      className="py-3.5 px-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setQrModalItem({
                            printable: toPrintableQrItem(it),
                            id: it.id,
                          })
                        }
                        className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <QrCode className="w-3.5 h-3.5 text-industrial-600" />
                        <span>Cetak</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {qrModalItem && (
        <QrLabelModal
          items={[qrModalItem.printable]}
          itemIds={[qrModalItem.id]}
          onClose={() => setQrModalItem(null)}
        />
      )}
    </div>
  );
};
