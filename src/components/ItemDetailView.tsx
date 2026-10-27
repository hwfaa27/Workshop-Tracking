import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Edit3,
  History,
  Image as ImageIcon,
  MapPin,
  QrCode,
  ScanLine,
  UserCheck,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import {
  AttachmentCategory,
  COMPONENT_TYPES,
  ItemStatus,
  JOB_TYPES,
  LocationRecord,
  MAIN_WORKFLOW_STATUSES,
  PRIORITY_LABELS,
  SPECIAL_STATUSES,
  STATUS_LABELS,
  STATUS_SHORT_LABELS,
  UserProfile,
  WorkOrderItemDetail,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { compressImageFile, toPrintableQrItem } from '../lib/qrUtils';
import { QrLabelModal } from './QrLabelModal';

interface ItemDetailViewProps {
  item: WorkOrderItemDetail;
  locations: LocationRecord[];
  users: UserProfile[];
  openedFromScanner?: boolean;
  onScanAnother?: () => void;
  onBack: () => void;
  onUpdated: (updated: WorkOrderItemDetail) => void;
}

const CATEGORY_LABELS: Record<AttachmentCategory, string> = {
  INCOMING: 'Saat Diterima',
  BEFORE: 'Sebelum Perbaikan',
  DURING: 'Selama Pengerjaan',
  AFTER: 'Setelah Perbaikan',
};

export const ItemDetailView: React.FC<ItemDetailViewProps> = ({
  item,
  locations,
  users,
  openedFromScanner = false,
  onScanAnother,
  onBack,
  onUpdated,
}) => {
  const { profile, apiFetch } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'progress' | 'history' | 'photos' | 'workorder'
  >('progress');
  const [photoFilter, setPhotoFilter] = useState<'ALL' | AttachmentCategory>('ALL');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  // Action Modals
  const [modalMode, setModalMode] = useState<
    null | 'activity' | 'status' | 'move' | 'assign' | 'edit'
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Status form
  const [nextStatus, setNextStatus] = useState<ItemStatus>(item.currentStatus);
  const [statusNotes, setStatusNotes] = useState('');

  // Location move form
  const activeLocs = locations.filter((l) => l.isActive);
  const [toLocationId, setToLocationId] = useState<number>(
    activeLocs.find((l) => l.id !== item.currentLocationId)?.id ||
      activeLocs[0]?.id ||
      0
  );
  const [moveReason, setMoveReason] = useState('');

  // Fast QR Scan Combined Quick-Update State
  const [quickPanelOpen, setQuickPanelOpen] = useState<boolean>(
    Boolean(openedFromScanner)
  );
  const [quickStatus, setQuickStatus] = useState<ItemStatus>(item.currentStatus);
  const [quickLocationId, setQuickLocationId] = useState<number>(
    item.currentLocationId || activeLocs[0]?.id || 0
  );
  const [quickNotes, setQuickNotes] = useState('');
  const [quickLogActivity, setQuickLogActivity] = useState(true);
  const [quickPhoto, setQuickPhoto] = useState<{
    category: AttachmentCategory;
    fileName: string;
    mimeType: string;
    dataUrl: string;
  } | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickSuccessMsg, setQuickSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setQuickStatus(item.currentStatus);
    setQuickLocationId(item.currentLocationId || activeLocs[0]?.id || 0);
  }, [item.id, item.currentStatus, item.currentLocationId]);

  useEffect(() => {
    if (openedFromScanner) {
      setQuickPanelOpen(true);
    }
  }, [openedFromScanner, item.id]);

  // Daily activity form
  const [actJobType, setActJobType] = useState(item.repairType || JOB_TYPES[0]);
  const [actDesc, setActDesc] = useState('');
  const [actResult, setActResult] = useState('');
  const [actIssues, setActIssues] = useState('');
  const [actPhotos, setActPhotos] = useState<
    Array<{
      category: AttachmentCategory;
      fileName: string;
      mimeType: string;
      dataUrl: string;
    }>
  >([]);

  // Technician assignment form
  const techUsers = users.filter((u) => u.role === 'TEKNISI' && u.isActive);
  const [leadTechId, setLeadTechId] = useState<number>(
    item.leadTechnicianId || techUsers[0]?.id || 0
  );
  const [supportTechIds, setSupportTechIds] = useState<number[]>([]);
  const [assignJobType, setAssignJobType] = useState(
    item.repairType || JOB_TYPES[0]
  );
  const [assignNotes, setAssignNotes] = useState('');

  // Admin Edit form
  const [editForm, setEditForm] = useState({
    itemName: item.itemName,
    componentType: item.componentType,
    brandModel: item.brandModel,
    serialNumber: item.serialNumber,
    quantity: item.quantity,
    initialDamage: item.initialDamage,
    repairType: item.repairType,
    physicalCondition: item.physicalCondition,
    estimatedCompletion: item.estimatedCompletion.slice(0, 10),
    additionalNotes: item.additionalNotes,
  });

  const canModifyTechnical =
    profile?.role === 'ADMIN' ||
    profile?.role === 'SUPERVISOR' ||
    (profile?.role === 'TEKNISI' &&
      item.assignedTechnicianIds.includes(profile.id));

  const canSupervise =
    profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';

  const isAdmin = profile?.role === 'ADMIN';

  const fmtFullDate = (iso: string) =>
    new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const handleUploadActivityPhoto = async (
    category: AttachmentCategory,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const processed: typeof actPhotos = [];
    for (let i = 0; i < files.length; i++) {
      const comp = await compressImageFile(files[i]);
      processed.push({ ...comp, category });
    }
    setActPhotos((prev) => [...prev, ...processed]);
  };

  const handleQuickPhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const comp = await compressImageFile(file);
    setQuickPhoto({ ...comp, category: 'DURING' });
  };

  const submitQuickScanUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setQuickError(null);
    setQuickSuccessMsg(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/quick-scan-update`,
        {
          method: 'POST',
          body: JSON.stringify({
            newStatus: quickStatus,
            toLocationId: quickLocationId,
            notes: quickNotes,
            jobType: item.repairType || JOB_TYPES[0],
            logActivity: quickLogActivity,
            photos: quickPhoto ? [quickPhoto] : [],
          }),
        }
      );
      onUpdated(res.item);
      setQuickNotes('');
      setQuickPhoto(null);
      setQuickSuccessMsg(
        'Perubahan status, lokasi, dan progres berhasil disimpan permanen ke database.'
      );
    } catch (err) {
      setQuickError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan pembaruan cepat QR.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitStatusUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/status`,
        {
          method: 'POST',
          body: JSON.stringify({ newStatus: nextStatus, notes: statusNotes }),
        }
      );
      onUpdated(res.item);
      setStatusNotes('');
      setModalMode(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memperbarui status.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitMoveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/move`,
        {
          method: 'POST',
          body: JSON.stringify({ toLocationId, reason: moveReason }),
        }
      );
      onUpdated(res.item);
      setMoveReason('');
      setModalMode(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memindahkan lokasi.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitDailyActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/activities`,
        {
          method: 'POST',
          body: JSON.stringify({
            jobType: actJobType,
            description: actDesc,
            inspectionResult: actResult,
            issues: actIssues,
            photos: actPhotos,
          }),
        }
      );
      onUpdated(res.item);
      setActDesc('');
      setActResult('');
      setActIssues('');
      setActPhotos([]);
      setModalMode(null);
      setActiveTab('progress');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan progres.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitAssignTechnician = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/assign`,
        {
          method: 'POST',
          body: JSON.stringify({
            leadTechnicianId: leadTechId,
            supportTechnicianIds: supportTechIds,
            jobType: assignJobType,
            repairType: assignJobType,
            activityNotes: assignNotes,
          }),
        }
      );
      onUpdated(res.item);
      setAssignNotes('');
      setModalMode(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menugaskan teknisi.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitEditMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            ...editForm,
            estimatedCompletion: new Date(editForm.estimatedCompletion).toISOString(),
          }),
        }
      );
      onUpdated(res.item);
      setModalMode(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproval = async (
    approvalType: 'INSPECTION' | 'REPAIR' | 'ACTIVITY',
    activityId?: number
  ) => {
    try {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${item.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ approvalType, activityId }),
        }
      );
      onUpdated(res.item);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal memproses persetujuan.');
    }
  };

  const filteredPhotos =
    photoFilter === 'ALL'
      ? item.attachments
      : item.attachments.filter((p) => p.category === photoFilter);

  const currentStageIdx = MAIN_WORKFLOW_STATUSES.indexOf(item.currentStatus);
  const nextSuggestedStage =
    currentStageIdx >= 0 && currentStageIdx < MAIN_WORKFLOW_STATUSES.length - 1
      ? MAIN_WORKFLOW_STATUSES[currentStageIdx + 1]
      : null;

  return (
    <div className="space-y-6">
      {/* Top Navigation Return, Scan Next & QR Reprint */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[42px] px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {onScanAnother && (
            <button
              type="button"
              onClick={onScanAnother}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-industrial-600 hover:bg-industrial-700 text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ScanLine className="w-4 h-4" />
              <span>Scan Barang Lain</span>
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setModalMode('edit');
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
              <span>Ubah Info Barang</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-surface-dark text-xs sm:text-sm font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-industrial-600" />
            <span>Label QR Code</span>
          </button>
        </div>
      </div>

      {quickSuccessMsg && (
        <div className="p-4 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 flex flex-wrap items-center justify-between gap-3 text-xs text-green-800 dark:text-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span>{quickSuccessMsg}</span>
          </div>
          <div className="flex items-center gap-3">
            {onScanAnother && (
              <button
                type="button"
                onClick={onScanAnother}
                className="font-semibold text-industrial-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                Scan Barang Berikutnya →
              </button>
            )}
            <button
              type="button"
              onClick={() => setQuickSuccessMsg(null)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Fast Post-Scan Operational Panel: One-Screen Progress, Status & Location Move */}
      {canModifyTechnical && quickPanelOpen && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border-2 border-industrial-600/35 p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-industrial-600 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Eksekusi Cepat Hasil Scan QR</span>
              </p>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Perbarui Status, Progres & Pindah Lokasi Sekaligus
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setQuickPanelOpen(false)}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              aria-label="Tutup panel cepat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {quickError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {quickError}
            </div>
          )}

          {nextSuggestedStage && quickStatus !== nextSuggestedStage && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/50 text-xs">
              <span className="text-slate-700 dark:text-slate-200">
                Tahap alur berikutnya yang disarankan:{' '}
                <strong>{STATUS_LABELS[nextSuggestedStage]}</strong>
              </span>
              <button
                type="button"
                onClick={() => setQuickStatus(nextSuggestedStage)}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-industrial-600 text-white font-semibold cursor-pointer"
              >
                Pilih Tahap Ini
              </button>
            </div>
          )}

          <form onSubmit={submitQuickScanUpdate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status Pengerjaan
                </label>
                <select
                  value={quickStatus}
                  onChange={(e) => setQuickStatus(e.target.value as ItemStatus)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium"
                >
                  <optgroup label="Alur Utama Pengerjaan">
                    {MAIN_WORKFLOW_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                        {st === item.currentStatus ? ' (Saat Ini)' : ''}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Status Khusus / Kendala">
                    {SPECIAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                        {st === item.currentStatus ? ' (Saat Ini)' : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Lokasi Fisik di Workshop
                </label>
                <select
                  value={quickLocationId}
                  onChange={(e) => setQuickLocationId(Number(e.target.value))}
                  className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-medium"
                >
                  {activeLocs.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                      {loc.id === item.currentLocationId ? ' — Lokasi Saat Ini' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Catatan Progres Pengerjaan / Alasan Perpindahan *
              </label>
              <input
                type="text"
                required
                placeholder="Contoh: Bubut jurnal selesai toleransi 0.01mm, dipindahkan ke Balancing Area..."
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                className="w-full min-h-[46px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={quickLogActivity}
                    onChange={(e) => setQuickLogActivity(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Catat juga ke Timeline Progres Harian</span>
                </label>

                <label className="min-h-[38px] px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-industrial-600 text-xs font-medium flex items-center gap-1.5 cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-industrial-600" />
                  <span>
                    {quickPhoto ? 'Foto Terlampir (Ganti)' : 'Lampirkan Foto Kamera'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleQuickPhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[46px] px-6 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {submitting ? 'Menyimpan...' : 'Simpan Pembaruan Cepat'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Item Specification Header Card (Matches Section 10 Specification) */}
      <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-7 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-navy-900 dark:text-blue-300">
                WORKSHOPTRACK
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                Work Order: {item.woNumber}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Kode: {item.itemCode}</span>
              <span aria-hidden="true">·</span>
              <span>Prioritas: {PRIORITY_LABELS[item.priority]}</span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
              {item.itemName}
            </h1>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Customer: <strong className="font-semibold">{item.companyName}</strong> ({item.customerName})
              {item.brandModel ? ` · ${item.brandModel}` : ''}
              {item.serialNumber ? ` · SN: ${item.serialNumber}` : ''}
            </p>
          </div>

          <div className="lg:text-right space-y-1.5 shrink-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">Status Pengerjaan</p>
            <p
              className={`font-mono text-base sm:text-lg font-bold tracking-tight ${
                item.currentStatus === 'DELIVERED' ||
                item.currentStatus === 'READY_FOR_DELIVERY'
                  ? 'text-green-600 dark:text-green-400'
                  : item.currentStatus === 'WAITING_FOR_SPARE_PART' ||
                    item.currentStatus === 'ON_HOLD' ||
                    item.currentStatus === 'REWORK'
                  ? 'text-amber-600 dark:text-amber-400'
                  : item.currentStatus === 'CANCELLED'
                  ? 'text-red-600'
                  : 'text-industrial-600 dark:text-blue-400'
              }`}
            >
              {STATUS_SHORT_LABELS[item.currentStatus]}
            </p>
            {item.isOverdue && (
              <p className="text-xs font-medium text-red-600 flex lg:justify-end items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Melewati Estimasi Penyelesaian</span>
              </p>
            )}
          </div>
        </div>

        {/* Key Operational Metadata Strip */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Lokasi Saat Ini</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {item.currentLocationName}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Teknisi Utama</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {item.leadTechnicianName}
            </p>
            {item.supportTechnicianNames.length > 0 && (
              <p className="text-[11px] text-slate-500">
                Pendukung: {item.supportTechnicianNames.join(', ')}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Progress Tahapan Disetujui
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <span className="font-mono text-base font-bold text-industrial-600 tabular-nums">
                {item.approvedStageProgress}%
              </span>
              <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-industrial-600 rounded-full transition-transform duration-200"
                  style={{ width: `${item.approvedStageProgress}%` }}
                />
              </div>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Tanggal Masuk</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white tabular-nums">
              {fmtFullDate(item.receivedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Estimasi Selesai</p>
            <p
              className={`mt-1 text-sm font-semibold tabular-nums ${
                item.isOverdue
                  ? 'text-red-600'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {fmtFullDate(item.estimatedCompletion)}
            </p>
          </div>
        </div>

        {/* Workflow Pipeline Stepper */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {MAIN_WORKFLOW_STATUSES.map((st, idx) => {
              const reached = currentStageIdx >= idx;
              const isCurrent = item.currentStatus === st;
              return (
                <div
                  key={st}
                  className={`px-3 py-2 rounded-lg border text-xs transition-colors ${
                    isCurrent
                      ? 'border-industrial-600 bg-blue-50/70 dark:bg-blue-950/40 text-industrial-700 dark:text-blue-300 font-semibold'
                      : reached
                      ? 'border-green-600/30 bg-green-50/40 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                      : 'border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="font-mono text-[10px] block tabular-nums">
                    0{idx + 1}
                  </span>
                  <span className="truncate block">{STATUS_LABELS[st]}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Primary Operational Action Buttons (Section 10) */}
        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-2.5">
          {canModifyTechnical && (
            <>
              {!quickPanelOpen && (
                <button
                  type="button"
                  onClick={() => {
                    setQuickError(null);
                    setQuickPanelOpen(true);
                  }}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Zap className="w-4 h-4" />
                  <span>Update & Pindah Cepat</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setModalMode('activity');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-industrial-600/40 text-industrial-700 dark:text-blue-300 hover:bg-blue-50/70 dark:hover:bg-blue-950/30 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Wrench className="w-4 h-4" />
                <span>Laporan Detail & Foto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setNextStatus(item.currentStatus);
                  setModalMode('status');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Ubah Status</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActionError(null);
                  setModalMode('move');
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-industrial-600" />
                <span>Pindahkan Lokasi</span>
              </button>
            </>
          )}

          {canSupervise && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setModalMode('assign');
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-industrial-600" />
              <span>Tugaskan Teknisi</span>
            </button>
          )}

          {canSupervise && !item.inspectionApproved && (
            <button
              type="button"
              onClick={() => handleApproval('INSPECTION')}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-green-600/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs sm:text-sm font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Setujui Hasil Inspeksi</span>
            </button>
          )}

          {canSupervise && item.inspectionApproved && !item.repairApproved && (
            <button
              type="button"
              onClick={() => handleApproval('REPAIR')}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-green-600/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs sm:text-sm font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Setujui Hasil Perbaikan & QC</span>
            </button>
          )}

          {profile?.role === 'TEKNISI' && !canModifyTechnical && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Mode Baca: Anda hanya dapat mengubah status/progres pada barang yang ditugaskan kepada Anda.
            </p>
          )}
        </div>
      </div>

      {/* Segmented Section Tabs (Lihat Riwayat, Dokumentasi Foto, Detail Work Order) */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
        {[
          { id: 'progress' as const, label: `Progres Harian (${item.activities.length})`, icon: Wrench },
          {
            id: 'history' as const,
            label: `Lihat Riwayat (${item.statusHistory.length + item.movementHistory.length})`,
            icon: History,
          },
          {
            id: 'photos' as const,
            label: `Dokumentasi Foto (${item.attachments.length})`,
            icon: ImageIcon,
          },
          { id: 'workorder' as const, label: 'Detail Work Order', icon: ClipboardCheck },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 min-h-[42px] px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === t.id
                  ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content 1: Daily Work Progress */}
      {activeTab === 'progress' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Timeline Aktivitas & Progres Harian Teknisi
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Seluruh laporan inspeksi, aktivitas pengerjaan, kendala teknis, dan persetujuan supervisor.
              </p>
            </div>
          </div>

          {item.activities.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-sm text-slate-500">
                Belum ada laporan aktivitas harian yang dicatat untuk barang ini.
              </p>
              {canModifyTechnical && (
                <button
                  type="button"
                  onClick={() => setModalMode('activity')}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-industrial-600 text-white text-xs font-semibold"
                >
                  Isi Laporan Aktivitas Pertama
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {item.activities.map((act) => (
                <div key={act.id} className="py-5 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">
                        {act.jobType}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Teknisi: {act.technicianName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {fmtDateTime(act.createdAt)}
                      </span>
                    </div>

                    {act.isApproved ? (
                      <span className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Disetujui oleh {act.approvedByName}</span>
                      </span>
                    ) : (
                      canSupervise && (
                        <button
                          type="button"
                          onClick={() => handleApproval('ACTIVITY', act.id)}
                          className="min-h-[36px] px-3 py-1 rounded-lg border border-green-600/40 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 cursor-pointer"
                        >
                          Setujui Laporan Ini
                        </button>
                      )
                    )}
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {act.description}
                  </p>

                  {act.inspectionResult && (
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <strong className="text-slate-900 dark:text-white">
                        Hasil Inspeksi / Pengukuran:
                      </strong>{' '}
                      {act.inspectionResult}
                    </div>
                  )}

                  {act.issues && (
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      <strong>Kendala Lapangan:</strong> {act.issues}
                    </div>
                  )}

                  {act.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {act.attachments.map((ph) => (
                        <button
                          key={ph.id}
                          type="button"
                          onClick={() => setLightboxUrl(ph.dataUrl)}
                          className="group text-left space-y-1 cursor-pointer"
                        >
                          <img
                            src={ph.dataUrl}
                            alt={ph.caption}
                            className="w-24 h-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700 group-hover:opacity-90"
                          />
                          <span className="block text-[10px] text-slate-500">
                            {CATEGORY_LABELS[ph.category]}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 2: Immutable Status & Location History */}
      {activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Riwayat Perubahan Status Pengerjaan
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {item.statusHistory.map((sh) => (
                <div key={sh.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {sh.previousStatus
                        ? `${STATUS_LABELS[sh.previousStatus as ItemStatus] || sh.previousStatus} → `
                        : ''}
                      <span className="text-industrial-600 dark:text-blue-400">
                        {STATUS_LABELS[sh.newStatus as ItemStatus] || sh.newStatus}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {fmtDateTime(sh.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {sh.notes}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Dicatat oleh: {sh.changedByName}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Riwayat Perpindahan Lokasi Fisik
            </h2>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {item.movementHistory.map((mv) => (
                <div key={mv.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {mv.fromLocationName ? `${mv.fromLocationName} → ` : 'Masuk → '}
                      <span className="text-industrial-600 dark:text-blue-400">
                        {mv.toLocationName}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {fmtDateTime(mv.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Alasan: {mv.reason}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Dipindahkan oleh: {mv.movedByName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 3: Photo Documentation */}
      {activeTab === 'photos' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Dokumentasi Foto Komponen & Perbaikan
              </h2>
              <p className="text-xs text-slate-500">
                Foto kondisi saat diterima, sebelum pengerjaan, selama proses mesin, dan setelah selesai.
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg overflow-x-auto">
              {(['ALL', 'INCOMING', 'BEFORE', 'DURING', 'AFTER'] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPhotoFilter(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                    photoFilter === cat
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {cat === 'ALL' ? 'Semua Foto' : CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          {filteredPhotos.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Belum ada foto dokumentasi pada kategori ini.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredPhotos.map((ph) => (
                <button
                  key={ph.id}
                  type="button"
                  onClick={() => setLightboxUrl(ph.dataUrl)}
                  className="text-left group space-y-2 cursor-pointer"
                >
                  <div className="aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
                    <img
                      src={ph.dataUrl}
                      alt={ph.caption}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {CATEGORY_LABELS[ph.category]}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {ph.uploadedByName} · {fmtDateTime(ph.createdAt)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 4: Work Order Specifications & Technician Assignment History */}
      {activeTab === 'workorder' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Spesifikasi Penerimaan & Kerusakan Awal
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Nomor Work Order</dt>
                <dd className="font-mono font-semibold mt-0.5">{item.woNumber}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Kode Item Unik</dt>
                <dd className="font-mono font-semibold mt-0.5">{item.itemCode}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Jenis Komponen</dt>
                <dd className="font-medium mt-0.5">{item.componentType}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Jumlah Barang</dt>
                <dd className="font-mono font-medium mt-0.5">{item.quantity} Unit</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Petugas Penerima</dt>
                <dd className="font-medium mt-0.5">{item.receiverName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Jenis Perbaikan</dt>
                <dd className="font-medium mt-0.5">{item.repairType}</dd>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <dt className="text-xs text-slate-500">Keluhan / Kerusakan Awal</dt>
                <dd className="mt-1 text-slate-800 dark:text-slate-200 leading-relaxed">
                  {item.initialDamage}
                </dd>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <dt className="text-xs text-slate-500">Kondisi Fisik Saat Diterima</dt>
                <dd className="mt-1 text-slate-800 dark:text-slate-200 leading-relaxed">
                  {item.physicalCondition}
                </dd>
              </div>
              {(item.woNotes || item.additionalNotes) && (
                <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <dt className="text-xs text-slate-500">Catatan Tambahan</dt>
                  <dd className="mt-1 text-slate-700 dark:text-slate-300">
                    {item.additionalNotes || item.woNotes}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Histori Penugasan Teknisi
            </h2>
            {item.assignments.length === 0 ? (
              <p className="text-sm text-slate-500">
                Supervisor belum menetapkan teknisi pada komponen ini.
              </p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {item.assignments.map((asg) => (
                  <div key={asg.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {asg.technicianName} ·{' '}
                        {asg.assignmentRole === 'LEAD' ? 'Utama' : 'Pendukung'}
                      </span>
                      <span
                        className={`font-medium ${
                          asg.assignmentStatus === 'ACTIVE'
                            ? 'text-green-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {asg.assignmentStatus === 'ACTIVE'
                          ? 'Aktif'
                          : 'Digantikan / Selesai'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Pekerjaan: {asg.jobType}
                    </p>
                    {asg.activityNotes && (
                      <p className="text-xs text-slate-500">{asg.activityNotes}</p>
                    )}
                    <p className="font-mono text-[11px] text-slate-400 tabular-nums">
                      Mulai: {fmtDateTime(asg.startedAt)}
                      {asg.completedAt ? ` · Selesai: ${fmtDateTime(asg.completedAt)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Update Daily Work Progress */}
      {modalMode === 'activity' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Laporan Progres Pekerjaan Harian
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                {actionError}
              </div>
            )}

            <form onSubmit={submitDailyActivity} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Jenis Pekerjaan *
                </label>
                <select
                  value={actJobType}
                  onChange={(e) => setActJobType(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  {JOB_TYPES.map((jt) => (
                    <option key={jt} value={jt}>
                      {jt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Deskripsi Aktivitas *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Contoh: Pemeriksaan diameter bearing journal, bending, radius, serta crack inspection..."
                  value={actDesc}
                  onChange={(e) => setActDesc(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Hasil Inspeksi / Pengukuran
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Pemeriksaan awal selesai dan dilanjutkan ke tahap evaluasi..."
                  value={actResult}
                  onChange={(e) => setActResult(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Kendala Pekerjaan (Jika Ada)
                </label>
                <input
                  type="text"
                  placeholder="Kosongkan jika lancar; isi jika butuh spare part / kendala teknis..."
                  value={actIssues}
                  onChange={(e) => setActIssues(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              {/* Photo Uploads: Before, During, After */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Unggah Dokumentasi Foto Perbaikan
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(['BEFORE', 'DURING', 'AFTER'] as AttachmentCategory[]).map(
                    (cat) => (
                      <label
                        key={cat}
                        className="min-h-[44px] px-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-industrial-600 flex items-center justify-center gap-1.5 text-xs cursor-pointer"
                      >
                        <Camera className="w-4 h-4 text-industrial-600 shrink-0" />
                        <span>
                          {cat === 'BEFORE'
                            ? 'Foto Sebelum'
                            : cat === 'DURING'
                            ? 'Foto Selama'
                            : 'Foto Setelah'}
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={(e) => handleUploadActivityPhoto(cat, e)}
                          className="hidden"
                        />
                      </label>
                    )
                  )}
                </div>

                {actPhotos.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {actPhotos.map((p, idx) => (
                      <div key={idx} className="relative">
                        <img
                          src={p.dataUrl}
                          alt={p.fileName}
                          className="w-16 h-14 rounded-lg object-cover border border-slate-200"
                        />
                        <span className="block text-[10px] text-center text-slate-500">
                          {p.category}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Laporan Progres'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Update Status */}
      {modalMode === 'status' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Perbarui Status Pengerjaan
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 text-xs text-red-700">
                {actionError}
              </div>
            )}

            <form onSubmit={submitStatusUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Pilih Status Terbaru *
                </label>
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as ItemStatus)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <optgroup label="Alur Utama Pengerjaan">
                    {MAIN_WORKFLOW_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Status Khusus / Kendala">
                    {SPECIAL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st]}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Pekerjaan (Wajib) *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Jelaskan hasil pengerjaan atau alasan perubahan status..."
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-navy-900 text-white text-sm font-semibold cursor-pointer"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Move Location */}
      {modalMode === 'move' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pindahkan Lokasi Fisik Barang
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 text-xs text-red-700">
                {actionError}
              </div>
            )}

            <form onSubmit={submitMoveLocation} className="space-y-4">
              <div className="text-xs text-slate-500">
                Lokasi saat ini:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {item.currentLocationName}
                </strong>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Lokasi Area Tujuan *
                </label>
                <select
                  value={toLocationId}
                  onChange={(e) => setToLocationId(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  {activeLocs.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alasan Perpindahan *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Contoh: Masuk proses dynamic balancing setelah grinding jurnal selesai"
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
                >
                  {submitting ? 'Memindahkan...' : 'Konfirmasi Pindah Lokasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Assign Technician */}
      {modalMode === 'assign' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Penugasan Teknisi Penanggung Jawab
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 text-xs text-red-700">
                {actionError}
              </div>
            )}

            {techUsers.length === 0 ? (
              <p className="text-sm text-amber-700">
                Belum ada akun dengan peran Teknisi. Tambahkan akun teknisi melalui menu Pengaturan → Akun Karyawan terlebih dahulu.
              </p>
            ) : (
              <form onSubmit={submitAssignTechnician} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teknisi Utama *
                  </label>
                  <select
                    required
                    value={leadTechId}
                    onChange={(e) => setLeadTechId(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {techUsers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} — {t.specialization}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Teknisi Pendukung (Opsional)
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 space-y-1.5">
                    {techUsers
                      .filter((t) => t.id !== leadTechId)
                      .map((t) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 text-xs cursor-pointer py-1"
                        >
                          <input
                            type="checkbox"
                            checked={supportTechIds.includes(t.id)}
                            onChange={(e) =>
                              setSupportTechIds((prev) =>
                                e.target.checked
                                  ? [...prev, t.id]
                                  : prev.filter((id) => id !== t.id)
                              )
                            }
                          />
                          <span>
                            {t.fullName} ({t.specialization})
                          </span>
                        </label>
                      ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Jenis Pekerjaan *
                  </label>
                  <select
                    value={assignJobType}
                    onChange={(e) => setAssignJobType(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {JOB_TYPES.map((jt) => (
                      <option key={jt} value={jt}>
                        {jt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Catatan Instruksi Supervisor
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Instruksi toleransi, target waktu, atau SOP pengerjaan..."
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[44px] px-5 rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
                  >
                    {submitting ? 'Menyimpan...' : 'Tetapkan Penugasan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Admin Edit Item Info */}
      {modalMode === 'edit' && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Ubah Informasi Teknis Barang ({item.itemCode})
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitEditMetadata} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Nama Barang *</label>
                  <input
                    type="text"
                    required
                    value={editForm.itemName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, itemName: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Jenis Komponen</label>
                  <select
                    value={editForm.componentType}
                    onChange={(e) =>
                      setEditForm({ ...editForm, componentType: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  >
                    {COMPONENT_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Merek & Model</label>
                  <input
                    type="text"
                    value={editForm.brandModel}
                    onChange={(e) =>
                      setEditForm({ ...editForm, brandModel: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={editForm.serialNumber}
                    onChange={(e) =>
                      setEditForm({ ...editForm, serialNumber: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Estimasi Selesai</label>
                  <input
                    type="date"
                    required
                    value={editForm.estimatedCompletion}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        estimatedCompletion: e.target.value,
                      })
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Jenis Perbaikan</label>
                  <input
                    type="text"
                    value={editForm.repairType}
                    onChange={(e) =>
                      setEditForm({ ...editForm, repairType: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Kerusakan Awal</label>
                <textarea
                  rows={2}
                  value={editForm.initialDamage}
                  onChange={(e) =>
                    setEditForm({ ...editForm, initialDamage: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-5 rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Label Print / PNG Modal */}
      {showQrModal && (
        <QrLabelModal
          items={[toPrintableQrItem(item)]}
          itemIds={[item.id]}
          onClose={() => setShowQrModal(false)}
        />
      )}

      {/* Fullscreen Photo Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={lightboxUrl}
            alt="Dokumentasi Perbaikan"
            className="max-w-full max-h-[88vh] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
};
