import React, { useState } from 'react';
import { Plus, QrCode, Search } from 'lucide-react';
import {
  PRIORITY_LABELS,
  PriorityLevel,
  STATUS_LABELS,
  WorkOrderRecord,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { toPrintableQrItem } from '../lib/qrUtils';
import { QrLabelModal } from './QrLabelModal';

interface WorkOrdersViewProps {
  workOrders: WorkOrderRecord[];
  onOpenIncomingModal: () => void;
  onSelectItem: (itemId: number) => void;
  onRefresh: () => Promise<void>;
}

export const WorkOrdersView: React.FC<WorkOrdersViewProps> = ({
  workOrders,
  onOpenIncomingModal,
  onSelectItem,
  onRefresh,
}) => {
  const { profile, apiFetch } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedWoForQr, setSelectedWoForQr] = useState<WorkOrderRecord | null>(
    null
  );
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const canChangePriority =
    profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';

  const handlePriorityChange = async (woId: number, priority: PriorityLevel) => {
    setPriorityError(null);
    try {
      await apiFetch(`/api/work-orders/${woId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      await onRefresh();
    } catch (err) {
      setPriorityError(
        err instanceof Error ? err.message : 'Gagal memperbarui prioritas Work Order.'
      );
    }
  };

  const filtered = workOrders.filter((wo) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      wo.woNumber.toLowerCase().includes(q) ||
      wo.companyName.toLowerCase().includes(q) ||
      wo.customerName.toLowerCase().includes(q) ||
      wo.items.some((i) => i.itemName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Manajemen Work Order & Penerimaan Barang
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Kelola dokumen penerimaan komponen, prioritas pengerjaan supervisor, dan cetak seluruh label QR per Work Order.
          </p>
        </div>

        {profile?.role === 'ADMIN' && (
          <button
            type="button"
            onClick={onOpenIncomingModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Penerimaan Barang Baru</span>
          </button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nomor WO, perusahaan customer, atau komponen..."
          className="w-full min-h-[44px] pl-10 pr-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-sm"
        />
      </div>

      {priorityError && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {priorityError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-500">
          Belum ada dokumen Work Order yang ditemukan.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((wo) => (
            <div
              key={wo.id}
              className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="font-mono text-sm font-bold text-industrial-600 tabular-nums">
                      {wo.woNumber}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Diterima:{' '}
                      {new Date(wo.receivedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Penerima: {wo.receiverName}</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {wo.companyName}{' '}
                    <span className="font-normal text-sm text-slate-500">
                      (PIC: {wo.customerName})
                    </span>
                  </h2>
                  {wo.notes && (
                    <p className="text-xs text-slate-500">{wo.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {canChangePriority ? (
                    <select
                      value={wo.priority}
                      onChange={(e) =>
                        handlePriorityChange(
                          wo.id,
                          e.target.value as PriorityLevel
                        )
                      }
                      aria-label="Prioritas Work Order"
                      className="min-h-[38px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium"
                    >
                      <option value="LOW">Prioritas: Rendah</option>
                      <option value="NORMAL">Prioritas: Normal</option>
                      <option value="HIGH">Prioritas: Tinggi</option>
                      <option value="URGENT">Prioritas: Mendesak</option>
                    </select>
                  ) : (
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      Prioritas: {PRIORITY_LABELS[wo.priority]}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => setSelectedWoForQr(wo)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <QrCode className="w-3.5 h-3.5 text-industrial-600" />
                    <span>Label QR ({wo.itemCount})</span>
                  </button>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800/70">
                {wo.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => onSelectItem(it.id)}
                    className="w-full py-2.5 text-left flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                        {it.itemCode}
                      </span>
                      <span className="mx-2 text-slate-300">·</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-white">
                        {it.itemName}
                      </span>
                      <span className="text-xs text-slate-500">
                        {' '}
                        ({it.componentType}) · Lokasi: {it.currentLocationName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-slate-600 dark:text-slate-300">
                        {STATUS_LABELS[it.currentStatus]}
                      </span>
                      <span className="font-mono font-semibold text-industrial-600 tabular-nums">
                        {it.approvedStageProgress}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedWoForQr && (
        <QrLabelModal
          title={`Label QR Work Order ${selectedWoForQr.woNumber}`}
          items={selectedWoForQr.items.map(toPrintableQrItem)}
          itemIds={selectedWoForQr.items.map((i) => i.id)}
          onClose={() => setSelectedWoForQr(null)}
        />
      )}
    </div>
  );
};
