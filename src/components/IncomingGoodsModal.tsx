import React, { useState } from 'react';
import { Camera, Plus, Trash2, X } from 'lucide-react';
import {
  COMPONENT_TYPES,
  CustomerRecord,
  LocationRecord,
  PriorityLevel,
  WorkOrderRecord,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { compressImageFile } from '../lib/qrUtils';

interface IncomingItemDraft {
  itemName: string;
  componentType: string;
  brandModel: string;
  serialNumber: string;
  quantity: number;
  initialDamage: string;
  repairType: string;
  physicalCondition: string;
  locationId: number | '';
  additionalNotes: string;
  incomingPhotos: Array<{ fileName: string; mimeType: string; dataUrl: string }>;
}

interface IncomingGoodsModalProps {
  customers: CustomerRecord[];
  locations: LocationRecord[];
  onClose: () => void;
  onCreated: (wo: WorkOrderRecord) => void;
}

export const IncomingGoodsModal: React.FC<IncomingGoodsModalProps> = ({
  customers,
  locations,
  onClose,
  onCreated,
}) => {
  const { profile, apiFetch } = useAuth();

  const defaultEst = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const activeLocations = locations.filter((l) => l.isActive);
  const receivingLocId =
    activeLocations.find((l) => l.name.toLowerCase().includes('receiving'))?.id ||
    activeLocations[0]?.id ||
    '';

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(
    customers.length > 0 ? 'existing' : 'new'
  );
  const [customerId, setCustomerId] = useState<number | ''>(
    customers[0]?.id || ''
  );
  const [newCustomer, setNewCustomer] = useState({
    contactName: '',
    companyName: '',
    phone: '',
    email: '',
  });

  const [receivedAt, setReceivedAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [receiverName, setReceiverName] = useState(profile?.fullName || '');
  const [priority, setPriority] = useState<PriorityLevel>('NORMAL');
  const [estimatedCompletion, setEstimatedCompletion] = useState(defaultEst);
  const [notes, setNotes] = useState('');

  const [items, setItems] = useState<IncomingItemDraft[]>([
    {
      itemName: '',
      componentType: COMPONENT_TYPES[0],
      brandModel: '',
      serialNumber: '',
      quantity: 1,
      initialDamage: '',
      repairType: 'Inspeksi Awal & Evaluasi Dimensi',
      physicalCondition: '',
      locationId: receivingLocId,
      additionalNotes: '',
      incomingPhotos: [],
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      {
        itemName: '',
        componentType: COMPONENT_TYPES[0],
        brandModel: '',
        serialNumber: '',
        quantity: 1,
        initialDamage: '',
        repairType: 'Inspeksi Awal & Evaluasi Dimensi',
        physicalCondition: '',
        locationId: receivingLocId,
        additionalNotes: '',
        incomingPhotos: [],
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItemField = <K extends keyof IncomingItemDraft>(
    index: number,
    field: K,
    value: IncomingItemDraft[K]
  ) => {
    setItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, [field]: value } : it))
    );
  };

  const handlePhotoSelect = async (
    index: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      const uploaded: Array<{
        fileName: string;
        mimeType: string;
        dataUrl: string;
      }> = [];
      for (let i = 0; i < files.length; i++) {
        const compressed = await compressImageFile(files[i]);
        uploaded.push(compressed);
      }
      setItems((prev) =>
        prev.map((it, idx) =>
          idx === index
            ? { ...it, incomingPhotos: [...it.incomingPhotos, ...uploaded] }
            : it
        )
      );
    } catch {
      setError('Gagal memproses foto barang.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload = {
        customerId:
          customerMode === 'existing' && customerId ? Number(customerId) : undefined,
        newCustomer: customerMode === 'new' ? newCustomer : undefined,
        receivedAt: new Date(receivedAt).toISOString(),
        receiverName,
        priority,
        estimatedCompletion: new Date(estimatedCompletion).toISOString(),
        notes,
        items: items.map((it) => ({
          ...it,
          locationId: it.locationId ? Number(it.locationId) : undefined,
          estimatedCompletion: new Date(estimatedCompletion).toISOString(),
        })),
      };

      const res = await apiFetch<{ workOrder: WorkOrderRecord }>(
        '/api/work-orders',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );

      onCreated(res.workOrder);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Gagal menyimpan penerimaan barang.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[92vh] rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Form Penerimaan Barang Masuk (Incoming Goods)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nomor Work Order (WO-YYYY-XXXX) dan QR Code unik dibuat otomatis oleh server saat disimpan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="p-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Section 1: Customer & Work Order Info */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                01. Informasi Customer & Work Order
              </h3>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  disabled={customers.length === 0}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    customerMode === 'existing'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Customer Terdaftar ({customers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('new')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    customerMode === 'new'
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Customer Baru
                </button>
              </div>
            </div>

            {customerMode === 'existing' && customers.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Pilih Perusahaan / Customer *
                </label>
                <select
                  required
                  value={customerId}
                  onChange={(e) => setCustomerId(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="">-- Pilih Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} — PIC: {c.contactName} ({c.customerCode})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Perusahaan *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: PT Contoh Industri"
                    value={newCustomer.companyName}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, companyName: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nama Customer / PIC *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Ir. Darmawan"
                    value={newCustomer.contactName}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, contactName: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Nomor Telepon
                  </label>
                  <input
                    type="text"
                    placeholder="021-8910..."
                    value={newCustomer.phone}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, phone: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email Perusahaan
                  </label>
                  <input
                    type="email"
                    placeholder="engineering@perusahaan.co.id"
                    value={newCustomer.email}
                    onChange={(e) =>
                      setNewCustomer({ ...newCustomer, email: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Tanggal & Waktu Terima *
                </label>
                <input
                  type="datetime-local"
                  required
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Penerima Barang *
                </label>
                <input
                  type="text"
                  required
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Prioritas Pekerjaan
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as PriorityLevel)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                >
                  <option value="LOW">Rendah</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Tinggi</option>
                  <option value="URGENT">Mendesak (Urgent)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Estimasi Penyelesaian *
                </label>
                <input
                  type="date"
                  required
                  value={estimatedCompletion}
                  onChange={(e) => setEstimatedCompletion(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Catatan Tambahan Work Order
              </label>
              <input
                type="text"
                placeholder="Referensi PO / surat jalan / instruksi khusus customer..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
              />
            </div>
          </div>

          {/* Section 2: Items List */}
          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  02. Daftar Komponen / Barang ({items.length} Item)
                </h3>
                <p className="text-xs text-slate-500">
                  Setiap barang dalam Work Order memperoleh Item ID dan QR Code tersendiri.
                </p>
              </div>
              <button
                type="button"
                onClick={addItemRow}
                className="min-h-[40px] px-3.5 py-1.5 rounded-lg border border-industrial-600 text-industrial-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Item Barang</span>
              </button>
            </div>

            <div className="space-y-6">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className="pt-4 first:pt-0 border-t first:border-t-0 border-slate-200 dark:border-slate-800 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-industrial-600">
                      ITEM #{String(idx + 1).padStart(2, '0')}
                    </span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(idx)}
                        className="text-xs text-red-600 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Item</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Nama Barang *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Crankshaft"
                        value={item.itemName}
                        onChange={(e) =>
                          updateItemField(idx, 'itemName', e.target.value)
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Jenis Komponen *
                      </label>
                      <select
                        value={item.componentType}
                        onChange={(e) =>
                          updateItemField(idx, 'componentType', e.target.value)
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
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Merek & Model
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: Caterpillar 3512B"
                        value={item.brandModel}
                        onChange={(e) =>
                          updateItemField(idx, 'brandModel', e.target.value)
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Serial Number (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="SN / Part No."
                        value={item.serialNumber}
                        onChange={(e) =>
                          updateItemField(idx, 'serialNumber', e.target.value)
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Jumlah Unit *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          updateItemField(idx, 'quantity', Number(e.target.value))
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Lokasi Penerimaan Awal
                      </label>
                      <select
                        value={item.locationId}
                        onChange={(e) =>
                          updateItemField(
                            idx,
                            'locationId',
                            e.target.value ? Number(e.target.value) : ''
                          )
                        }
                        className="w-full min-h-[44px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      >
                        {activeLocations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Keluhan / Kerusakan Awal *
                      </label>
                      <textarea
                        rows={2}
                        required
                        placeholder="Jelaskan indikasi kerusakan atau keluhan customer..."
                        value={item.initialDamage}
                        onChange={(e) =>
                          updateItemField(idx, 'initialDamage', e.target.value)
                        }
                        className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Kondisi Fisik Saat Diterima *
                      </label>
                      <textarea
                        rows={2}
                        required
                        placeholder="Contoh: Baret pada bearing journal #2, baut lengkap..."
                        value={item.physicalCondition}
                        onChange={(e) =>
                          updateItemField(idx, 'physicalCondition', e.target.value)
                        }
                        className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Rencana Jenis Perbaikan
                      </label>
                      <input
                        type="text"
                        value={item.repairType}
                        onChange={(e) =>
                          updateItemField(idx, 'repairType', e.target.value)
                        }
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Foto Barang Saat Datang
                      </label>
                      <label className="min-h-[44px] px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-industrial-600 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                        <Camera className="w-4 h-4 text-industrial-600" />
                        <span>Ambil / Pilih Foto ({item.incomingPhotos.length} foto)</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          onChange={(e) => handlePhotoSelect(idx, e)}
                          className="hidden"
                        />
                      </label>
                      {item.incomingPhotos.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 overflow-x-auto">
                          {item.incomingPhotos.map((ph, pIdx) => (
                            <img
                              key={pIdx}
                              src={ph.dataUrl}
                              alt={ph.fileName}
                              className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-medium"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {submitting ? 'Menyimpan & Membuat QR...' : 'Simpan & Buat QR Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
