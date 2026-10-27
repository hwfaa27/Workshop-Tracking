import React from 'react';
import { Settings, Wrench } from 'lucide-react';
import {
  STATUS_LABELS,
  UserProfile,
  WorkOrderItemSummary,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';

interface TechniciansViewProps {
  users: UserProfile[];
  items: WorkOrderItemSummary[];
  onSelectItem: (itemId: number) => void;
  onGoToSettings: () => void;
}

export const TechniciansView: React.FC<TechniciansViewProps> = ({
  users,
  items,
  onSelectItem,
  onGoToSettings,
}) => {
  const { profile } = useAuth();
  const technicians = users.filter((u) => u.role === 'TEKNISI');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Tracking Penugasan & Beban Kerja Teknisi
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Pantau teknisi utama & pendukung, komponen yang sedang dikerjakan, lokasi area, serta kapasitas personel workshop.
          </p>
        </div>

        {profile?.role === 'ADMIN' && (
          <button
            type="button"
            onClick={onGoToSettings}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-xs sm:text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-industrial-600" />
            <span>Kelola Akun Teknisi</span>
          </button>
        )}
      </div>

      {technicians.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <Wrench className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Belum ada akun karyawan dengan peran Teknisi.
          </p>
          {profile?.role === 'ADMIN' && (
            <button
              type="button"
              onClick={onGoToSettings}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-industrial-600 text-white text-xs font-semibold cursor-pointer"
            >
              Tambahkan Teknisi di Pengaturan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {technicians.map((tech) => {
            const assigned = items.filter((i) =>
              i.assignedTechnicianIds.includes(tech.id)
            );
            const activeJobs = assigned.filter(
              (i) =>
                !['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(
                  i.currentStatus
                )
            );
            const completedJobs = assigned.filter((i) =>
              ['READY_FOR_DELIVERY', 'DELIVERED'].includes(i.currentStatus)
            );

            return (
              <div
                key={tech.id}
                className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {tech.fullName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {tech.specialization} · {tech.email}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs tabular-nums">
                    <p className="font-bold text-industrial-600">
                      {activeJobs.length} Pekerjaan Aktif
                    </p>
                    <p className="text-slate-500">
                      {completedJobs.length} Selesai
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                  {activeJobs.length === 0 ? (
                    <p className="text-xs text-slate-400 py-2">
                      Saat ini siap menerima penugasan komponen baru.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {activeJobs.map((job) => (
                        <button
                          key={job.id}
                          type="button"
                          onClick={() => onSelectItem(job.id)}
                          className="w-full py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg px-2 transition-colors cursor-pointer space-y-0.5"
                        >
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {job.itemName}{' '}
                              <span className="font-mono text-industrial-600 font-normal">
                                ({job.itemCode})
                              </span>
                            </span>
                            <span className="font-mono font-semibold tabular-nums">
                              {job.approvedStageProgress}%
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Pekerjaan: {job.repairType} · Status:{' '}
                            {STATUS_LABELS[job.currentStatus]} · Lokasi:{' '}
                            {job.currentLocationName}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
