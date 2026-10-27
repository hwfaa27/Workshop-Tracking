import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  UserProfile,
  WorkOrderItemSummary,
  WorkOrderRecord,
} from '../types/workshop';

export type ReportTypeKey =
  | 'WORK_ORDERS'
  | 'ITEM_HISTORY'
  | 'MOVEMENT_HISTORY'
  | 'TECHNICIAN_PRODUCTIVITY'
  | 'MONTHLY_SUMMARY';

interface StatusLogEntry {
  id: number;
  itemCode: string;
  itemName: string;
  woNumber: string;
  previousStatus: string | null;
  newStatus: string;
  changedByName: string;
  notes: string;
  createdAt: string;
}

interface MovementLogEntry {
  id: number;
  itemCode: string;
  itemName: string;
  woNumber: string;
  fromLocationName: string | null;
  toLocationName: string;
  movedByName: string;
  reason: string;
  createdAt: string;
}

interface ActivityLogEntry {
  id: number;
  itemCode: string;
  itemName: string;
  woNumber: string;
  technicianName: string;
  jobType: string;
  description: string;
  inspectionResult: string;
  issues: string;
  createdAt: string;
}

export interface ReportsBundleData {
  workOrders: WorkOrderRecord[];
  items: WorkOrderItemSummary[];
  statusLogs: StatusLogEntry[];
  movementLogs: MovementLogEntry[];
  activities: ActivityLogEntry[];
  users: UserProfile[];
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildReportTable(
  reportType: ReportTypeKey,
  bundle: ReportsBundleData
): { title: string; subtitle: string; headers: string[]; rows: (string | number)[][] } {
  switch (reportType) {
    case 'WORK_ORDERS': {
      return {
        title: 'LAPORAN WORK ORDER & BARANG MASUK',
        subtitle: 'Daftar penerimaan komponen, prioritas pengerjaan, lokasi terkini, dan status penyelesaian',
        headers: [
          'No. Work Order',
          'Kode Barang',
          'Nama Komponen',
          'Perusahaan Customer',
          'Prioritas',
          'Status Saat Ini',
          'Lokasi Terkini',
          'Teknisi Utama',
          'Progress',
          'Tgl Masuk',
          'Estimasi Selesai',
        ],
        rows: bundle.items.map((it) => [
          it.woNumber,
          it.itemCode,
          it.itemName,
          it.companyName,
          PRIORITY_LABELS[it.priority] || it.priority,
          STATUS_LABELS[it.currentStatus] || it.currentStatus,
          it.currentLocationName,
          it.leadTechnicianName,
          `${it.approvedStageProgress}%`,
          fmtDateTime(it.receivedAt),
          fmtDateTime(it.estimatedCompletion),
        ]),
      };
    }

    case 'ITEM_HISTORY': {
      return {
        title: 'LAPORAN RIWAYAT PEKERJAAN & PERUBAHAN STATUS BARANG',
        subtitle: 'Jejak audit perubahan tahapan perbaikan dan aktivitas pengerjaan komponen',
        headers: [
          'Waktu',
          'No. WO',
          'Kode Barang',
          'Nama Barang',
          'Status Sebelumnya',
          'Status Terbaru',
          'Petugas',
          'Catatan Pekerjaan',
        ],
        rows: bundle.statusLogs.map((s) => [
          fmtDateTime(s.createdAt),
          s.woNumber,
          s.itemCode,
          s.itemName,
          s.previousStatus
            ? STATUS_LABELS[s.previousStatus as keyof typeof STATUS_LABELS] || s.previousStatus
            : 'Awal Diterima',
          STATUS_LABELS[s.newStatus as keyof typeof STATUS_LABELS] || s.newStatus,
          s.changedByName,
          s.notes,
        ]),
      };
    }

    case 'MOVEMENT_HISTORY': {
      return {
        title: 'LAPORAN RIWAYAT PERPINDAHAN LOKASI FISIK BARANG',
        subtitle: 'Rekam jejak perpindahan antar-area pemesinan, inspeksi, dan quality control',
        headers: [
          'Waktu Perpindahan',
          'No. WO',
          'Kode Barang',
          'Nama Barang',
          'Lokasi Asal',
          'Lokasi Tujuan',
          'Dipindahkan Oleh',
          'Alasan Perpindahan',
        ],
        rows: bundle.movementLogs.map((m) => [
          fmtDateTime(m.createdAt),
          m.woNumber,
          m.itemCode,
          m.itemName,
          m.fromLocationName || 'Penerimaan Awal',
          m.toLocationName,
          m.movedByName,
          m.reason,
        ]),
      };
    }

    case 'TECHNICIAN_PRODUCTIVITY': {
      const techs = bundle.users.filter((u) => u.role === 'TEKNISI');
      return {
        title: 'LAPORAN PRODUKTIVITAS & BEBAN KERJA TEKNISI',
        subtitle: 'Ringkasan penugasan aktif, penyelesaian barang, dan jumlah aktivitas harian teknisi',
        headers: [
          'Nama Teknisi',
          'Spesialisasi',
          'Pekerjaan Aktif',
          'Selesai Diperbaiki',
          'Laporan Harian Diisi',
          'Melewati Estimasi',
        ],
        rows: techs.map((t) => {
          const assigned = bundle.items.filter((i) =>
            i.assignedTechnicianIds.includes(t.id)
          );
          const active = assigned.filter(
            (i) => !['READY_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'].includes(i.currentStatus)
          ).length;
          const completed = assigned.filter((i) =>
            ['READY_FOR_DELIVERY', 'DELIVERED'].includes(i.currentStatus)
          ).length;
          const dailyCount = bundle.activities.filter(
            (a) => a.technicianName === t.fullName
          ).length;
          const overdue = assigned.filter((i) => i.isOverdue).length;
          return [t.fullName, t.specialization, active, completed, dailyCount, overdue];
        }),
      };
    }

    case 'MONTHLY_SUMMARY': {
      const monthMap = new Map<
        string,
        {
          total: number;
          inProgress: number;
          completed: number;
          delivered: number;
          overdue: number;
        }
      >();
      const months = [
        'Januari',
        'Februari',
        'Maret',
        'April',
        'Mei',
        'Juni',
        'Juli',
        'Agustus',
        'September',
        'Oktober',
        'November',
        'Desember',
      ];
      for (const item of bundle.items) {
        const d = new Date(item.receivedAt);
        const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
        const cur = monthMap.get(key) || {
          total: 0,
          inProgress: 0,
          completed: 0,
          delivered: 0,
          overdue: 0,
        };
        cur.total += 1;
        if (['READY_FOR_DELIVERY'].includes(item.currentStatus)) cur.completed += 1;
        else if (item.currentStatus === 'DELIVERED') cur.delivered += 1;
        else if (item.currentStatus !== 'CANCELLED') cur.inProgress += 1;
        if (item.isOverdue) cur.overdue += 1;
        monthMap.set(key, cur);
      }

      return {
        title: 'LAPORAN REKAPITULASI PEKERJAAN BULANAN WORKSHOP',
        subtitle: 'Statistik volume barang masuk, penyelesaian perbaikan, pengiriman, dan keterlambatan per bulan',
        headers: [
          'Periode Bulan',
          'Total Barang Masuk',
          'Masih Dalam Proses',
          'Selesai (Siap Kirim)',
          'Sudah Dikirim',
          'Melewati Estimasi',
        ],
        rows: Array.from(monthMap.entries()).map(([periode, s]) => [
          periode,
          s.total,
          s.inProgress,
          s.completed,
          s.delivered,
          s.overdue,
        ]),
      };
    }
  }
}

export function exportReportToExcel(
  reportType: ReportTypeKey,
  bundle: ReportsBundleData
): void {
  const { title, headers, rows } = buildReportTable(reportType, bundle);
  const aoa = [
    ['PT TJOKRO BERSAUDARA – WORKSHOPTRACK'],
    [title],
    [`Dicetak pada: ${fmtDateTime(new Date())}`],
    [],
    headers,
    ...rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 5, 18) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Laporan');
  XLSX.writeFile(
    workbook,
    `WorkshopTrack-${reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}

export function exportReportToPdf(
  reportType: ReportTypeKey,
  bundle: ReportsBundleData
): void {
  const { title, subtitle, headers, rows } = buildReportTable(reportType, bundle);
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // Industrial Header Banner
  doc.setFillColor(20, 45, 78);
  doc.rect(14, 12, 269, 20, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PT TJOKRO BERSAUDARA – WORKSHOPTRACK', 19, 20.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Tanggal Cetak: ${fmtDateTime(new Date())}`, 278, 20.5, { align: 'right' });
  doc.text(title, 19, 27.5);

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(9);
  doc.text(subtitle, 14, 38);

  autoTable(doc, {
    startY: 42,
    head: [headers],
    body: rows.length > 0 ? rows : [['Tidak ada data pada kategori laporan ini.']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [20, 45, 78],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [244, 246, 249],
    },
  });

  doc.save(
    `WorkshopTrack-${reportType.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`
  );
}

export { buildReportTable };
