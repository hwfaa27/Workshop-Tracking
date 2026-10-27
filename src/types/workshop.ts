export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'TEKNISI' | 'MANAJEMEN';

export type ItemStatus =
  | 'RECEIVED'
  | 'INITIAL_INSPECTION'
  | 'WAITING_FOR_APPROVAL'
  | 'IN_PROGRESS'
  | 'QUALITY_CONTROL'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'WAITING_FOR_SPARE_PART'
  | 'ON_HOLD'
  | 'REWORK'
  | 'CANCELLED';

export type PriorityLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type AttachmentCategory = 'INCOMING' | 'BEFORE' | 'DURING' | 'AFTER';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin Workshop',
  SUPERVISOR: 'Supervisor',
  TEKNISI: 'Teknisi',
  MANAJEMEN: 'Manajemen',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  RECEIVED: 'Diterima (Received)',
  INITIAL_INSPECTION: 'Inspeksi Awal',
  WAITING_FOR_APPROVAL: 'Menunggu Approval',
  IN_PROGRESS: 'Dalam Pengerjaan',
  QUALITY_CONTROL: 'Quality Control',
  READY_FOR_DELIVERY: 'Siap Dikirim',
  DELIVERED: 'Sudah Dikirim',
  WAITING_FOR_SPARE_PART: 'Menunggu Spare Part',
  ON_HOLD: 'Ditunda (On Hold)',
  REWORK: 'Pengerjaan Ulang (Rework)',
  CANCELLED: 'Dibatalkan',
};

export const STATUS_SHORT_LABELS: Record<ItemStatus, string> = {
  RECEIVED: 'RECEIVED',
  INITIAL_INSPECTION: 'INITIAL INSPECTION',
  WAITING_FOR_APPROVAL: 'WAITING APPROVAL',
  IN_PROGRESS: 'IN PROGRESS',
  QUALITY_CONTROL: 'QUALITY CONTROL',
  READY_FOR_DELIVERY: 'READY FOR DELIVERY',
  DELIVERED: 'DELIVERED',
  WAITING_FOR_SPARE_PART: 'WAITING SPARE PART',
  ON_HOLD: 'ON HOLD',
  REWORK: 'REWORK',
  CANCELLED: 'CANCELLED',
};

export const MAIN_WORKFLOW_STATUSES: ItemStatus[] = [
  'RECEIVED',
  'INITIAL_INSPECTION',
  'WAITING_FOR_APPROVAL',
  'IN_PROGRESS',
  'QUALITY_CONTROL',
  'READY_FOR_DELIVERY',
  'DELIVERED',
];

export const SPECIAL_STATUSES: ItemStatus[] = [
  'WAITING_FOR_SPARE_PART',
  'ON_HOLD',
  'REWORK',
  'CANCELLED',
];

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  LOW: 'Rendah',
  NORMAL: 'Normal',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

export const COMPONENT_TYPES: string[] = [
  'Crankshaft & Camshaft',
  'Cylinder Block & Head',
  'Hydraulic Cylinder & Pump',
  'Turbine & Compressor Rotor',
  'Industrial Gearbox',
  'Electric Motor & Generator Shaft',
  'Centrifugal Impeller & Valve',
  'Heavy Equipment Component',
];

export const JOB_TYPES: string[] = [
  'Initial Inspection & NDT',
  'Disassembly & Cleaning',
  'Precision Machining / Grinding',
  'Line Boring',
  'Dynamic Balancing',
  'Welding / Metalizing / Hardfacing',
  'Assembly & Calibration',
  'Final Quality Control',
];

export function computeStageProgress(
  status: string,
  inspectionApproved: boolean,
  repairApproved: boolean,
  previousProgress = 10
): number {
  switch (status as ItemStatus) {
    case 'RECEIVED':
      return 10;
    case 'INITIAL_INSPECTION':
      return inspectionApproved ? 30 : 22;
    case 'WAITING_FOR_APPROVAL':
      return inspectionApproved ? 40 : 35;
    case 'IN_PROGRESS':
      return repairApproved ? 75 : inspectionApproved ? 65 : 55;
    case 'QUALITY_CONTROL':
      return repairApproved ? 90 : 82;
    case 'READY_FOR_DELIVERY':
      return 95;
    case 'DELIVERED':
      return 100;
    case 'REWORK':
      return 50;
    case 'WAITING_FOR_SPARE_PART':
    case 'ON_HOLD':
      return Math.max(15, Math.min(previousProgress, 80));
    case 'CANCELLED':
      return 0;
    default:
      return previousProgress;
  }
}

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone: string;
  specialization: string;
  isActive: boolean;
  canSelfSwitchRole?: boolean;
  createdAt: string;
}

export interface CustomerRecord {
  id: number;
  customerCode: string;
  contactName: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface LocationRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface WorkOrderItemSummary {
  id: number;
  workOrderId: number;
  woNumber: string;
  priority: PriorityLevel;
  itemCode: string;
  qrToken: string;
  itemName: string;
  componentType: string;
  brandModel: string;
  serialNumber: string;
  quantity: number;
  initialDamage: string;
  repairType: string;
  physicalCondition: string;
  currentStatus: ItemStatus;
  currentLocationId: number | null;
  currentLocationName: string;
  leadTechnicianId: number | null;
  leadTechnicianName: string;
  supportTechnicianNames: string[];
  assignedTechnicianIds: number[];
  approvedStageProgress: number;
  inspectionApproved: boolean;
  repairApproved: boolean;
  customerName: string;
  companyName: string;
  customerId: number;
  receivedAt: string;
  estimatedCompletion: string;
  completedAt: string | null;
  deliveredAt: string | null;
  isOverdue: boolean;
}

export interface WorkOrderRecord {
  id: number;
  woNumber: string;
  customerId: number;
  customerName: string;
  companyName: string;
  receivedAt: string;
  receivedByUserId: number;
  receiverName: string;
  priority: PriorityLevel;
  estimatedCompletion: string;
  status: string;
  notes: string;
  itemCount: number;
  items: WorkOrderItemSummary[];
}

export interface StatusHistoryRecord {
  id: number;
  itemId: number;
  previousStatus: string | null;
  newStatus: string;
  changedByUserId: number;
  changedByName: string;
  notes: string;
  createdAt: string;
}

export interface MovementHistoryRecord {
  id: number;
  itemId: number;
  fromLocationId: number | null;
  toLocationId: number;
  fromLocationName: string | null;
  toLocationName: string;
  movedByUserId: number;
  movedByName: string;
  reason: string;
  createdAt: string;
}

export interface TechnicianAssignmentRecord {
  id: number;
  itemId: number;
  technicianId: number;
  technicianName: string;
  assignedById: number;
  assignedByName: string;
  assignmentRole: 'LEAD' | 'SUPPORT';
  jobType: string;
  assignmentStatus: 'ACTIVE' | 'COMPLETED' | 'REASSIGNED';
  activityNotes: string;
  startedAt: string;
  completedAt: string | null;
}

export interface AttachmentRecord {
  id: number;
  itemId: number;
  activityId: number | null;
  category: AttachmentCategory;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  caption: string;
  uploadedByUserId: number;
  uploadedByName: string;
  createdAt: string;
}

export interface RepairActivityRecord {
  id: number;
  itemId: number;
  technicianId: number;
  technicianName: string;
  jobType: string;
  description: string;
  inspectionResult: string;
  issues: string;
  isApproved: boolean;
  approvedById: number | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  attachments: AttachmentRecord[];
}

export interface WorkOrderItemDetail extends WorkOrderItemSummary {
  additionalNotes: string;
  receiverName: string;
  woNotes: string;
  statusHistory: StatusHistoryRecord[];
  movementHistory: MovementHistoryRecord[];
  assignments: TechnicianAssignmentRecord[];
  activities: RepairActivityRecord[];
  attachments: AttachmentRecord[];
}

export interface NotificationRecord {
  id: number;
  targetRole: string | null;
  targetUserId: number | null;
  type: string;
  title: string;
  message: string;
  itemId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorUserId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface DashboardPayload {
  kpis: {
    totalIncoming: number;
    inProgress: number;
    waitingSparePart: number;
    waitingApproval: number;
    inQualityControl: number;
    completedReady: number;
    delivered: number;
    overdue: number;
  };
  charts: {
    monthlyIncoming: { month: string; count: number }[];
    statusDistribution: { status: ItemStatus; label: string; count: number }[];
    avgRepairDuration: { componentType: string; avgDays: number; completedCount: number }[];
    technicianWorkload: {
      technicianId: number;
      technicianName: string;
      specialization: string;
      activeCount: number;
      completedCount: number;
    }[];
    weeklyCompleted: { week: string; count: number }[];
  };
  recentItems: WorkOrderItemSummary[];
  overdueItems: WorkOrderItemSummary[];
}
