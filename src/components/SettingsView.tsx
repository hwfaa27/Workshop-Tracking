import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  MapPin,
  Plus,
  Shield,
  Users,
} from 'lucide-react';
import {
  AuditLogRecord,
  CustomerRecord,
  LocationRecord,
  ROLE_LABELS,
  UserProfile,
  UserRole,
} from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallPrompt';

interface SettingsViewProps {
  users: UserProfile[];
  customers: CustomerRecord[];
  locations: LocationRecord[];
  onRefreshAll: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  users,
  customers,
  locations,
  onRefreshAll,
}) => {
  const { profile, apiFetch, switchMyRole } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';

  const [tab, setTab] = useState<
    'users' | 'customers' | 'locations' | 'audit' | 'guide'
  >('users');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // User form
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    role: 'TEKNISI' as UserRole,
    phone: '',
    specialization: 'Pemesinan & Inspeksi',
  });

  // Customer form
  const [newCustomer, setNewCustomer] = useState({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    address: '',
  });

  // Location form
  const [newLoc, setNewLoc] = useState({
    name: '',
    description: '',
  });

  // Audit logs
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);

  useEffect(() => {
    if (tab === 'audit' && ['ADMIN', 'SUPERVISOR', 'MANAJEMEN'].includes(profile?.role || '')) {
      apiFetch<{ auditLogs: AuditLogRecord[] }>('/api/reports')
        .then((res) => setAuditLogs(res.auditLogs || []))
        .catch(() => {});
    }
  }, [tab, profile?.role, apiFetch]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setNewUser({
        fullName: '',
        email: '',
        role: 'TEKNISI',
        phone: '',
        specialization: 'Pemesinan & Inspeksi',
      });
      setMessage('Akun karyawan berhasil didaftarkan.');
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah karyawan.');
    }
  };

  const handleUpdateUserRole = async (userId: number, role: UserRole) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah peran.');
    }
  };

  const handleToggleUserActive = async (userId: number, isActive: boolean) => {
    setError(null);
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    }
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify(newCustomer),
      });
      setNewCustomer({
        companyName: '',
        contactName: '',
        phone: '',
        email: '',
        address: '',
      });
      setMessage('Customer baru berhasil disimpan.');
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah customer.');
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await apiFetch('/api/locations', {
        method: 'POST',
        body: JSON.stringify(newLoc),
      });
      setNewLoc({ name: '', description: '' });
      setMessage('Lokasi area workshop berhasil ditambahkan.');
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menambah lokasi.');
    }
  };

  const handleToggleLocation = async (locId: number, isActive: boolean) => {
    setError(null);
    try {
      await apiFetch(`/api/locations/${locId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await onRefreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status lokasi.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
          Pengaturan Sistem, Master Data & Dokumentasi
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Kelola akun karyawan, otorisasi peran (RBAC), direktori customer, lokasi area fisik workshop, audit log, dan panduan deployment.
        </p>
      </div>

      {/* Role Switcher Card for Owner / Admin Testing RBAC */}
      {(profile?.canSelfSwitchRole || isAdmin) && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-industrial-600">
              Pengujian Hak Akses Sesi Aktif (Backend RBAC)
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Peran aktif Anda saat ini: <strong>{profile ? ROLE_LABELS[profile.role] : ''}</strong>. Anda dapat menguji tampilan dan validasi izin server untuk ke-4 peran pengguna:
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['ADMIN', 'SUPERVISOR', 'TEKNISI', 'MANAJEMEN'] as UserRole[]).map(
              (r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setError(null);
                    switchMyRole(r).catch((err) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : 'Gagal mengganti peran aktif.'
                      );
                    });
                  }}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    profile?.role === r
                      ? 'bg-navy-900 text-white'
                      : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-900 rounded-xl overflow-x-auto">
        {[
          { id: 'users' as const, label: 'Akun Karyawan', icon: Users },
          { id: 'customers' as const, label: 'Data Customer', icon: Building2 },
          { id: 'locations' as const, label: 'Lokasi Workshop', icon: MapPin },
          { id: 'audit' as const, label: 'Audit Log', icon: Shield },
          { id: 'guide' as const, label: 'Panduan PWA, Supabase & Vercel', icon: BookOpen },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setMessage(null);
                setError(null);
                setTab(item.id);
              }}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-colors shrink-0 cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-surface-dark text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3.5 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 text-xs text-green-700 dark:text-green-300">
          {message}
        </div>
      )}

      {/* TAB 1: Employee Accounts */}
      {tab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {isAdmin && (
            <form
              onSubmit={handleAddUser}
              className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 space-y-4 h-fit"
            >
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Daftarkan Akun Karyawan Baru
              </h2>
              <div>
                <label className="block text-xs font-medium mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Ahmad Pratama"
                  value={newUser.fullName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, fullName: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Email Akun Kerja (Google) *
                </label>
                <input
                  type="email"
                  required
                  placeholder="nama@perusahaan.co.id"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hak Akses Peran *</label>
                <select
                  value={newUser.role}
                  onChange={(e) =>
                    setNewUser({ ...newUser, role: e.target.value as UserRole })
                  }
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="SUPERVISOR">Supervisor</option>
                  <option value="TEKNISI">Teknisi</option>
                  <option value="MANAJEMEN">Manajemen</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Divisi / Spesialisasi
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Line Boring & Balancing"
                  value={newUser.specialization}
                  onChange={(e) =>
                    setNewUser({ ...newUser, specialization: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-industrial-600 hover:bg-industrial-700 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Simpan Akun Karyawan</span>
              </button>
            </form>
          )}

          <div
            className={`${
              isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'
            } rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden`}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Daftar Akun Pengguna ({users.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-medium">Nama & Email</th>
                    <th className="py-3 px-4 font-medium">Spesialisasi</th>
                    <th className="py-3 px-4 font-medium">Peran</th>
                    <th className="py-3 px-4 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {u.fullName}
                        </p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {u.specialization}
                      </td>
                      <td className="py-3 px-4">
                        {isAdmin ? (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleUpdateUserRole(
                                u.id,
                                e.target.value as UserRole
                              )
                            }
                            aria-label={`Peran ${u.fullName}`}
                            className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          >
                            <option value="ADMIN">Admin</option>
                            <option value="SUPERVISOR">Supervisor</option>
                            <option value="TEKNISI">Teknisi</option>
                            <option value="MANAJEMEN">Manajemen</option>
                          </select>
                        ) : (
                          <span className="text-xs font-medium">
                            {ROLE_LABELS[u.role]}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isAdmin && u.id !== profile?.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleUserActive(u.id, !u.isActive)
                            }
                            className={`text-xs font-semibold cursor-pointer ${
                              u.isActive ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {u.isActive ? 'Aktif' : 'Nonaktif'}
                          </button>
                        ) : (
                          <span className="text-xs text-green-600 font-medium">
                            Aktif
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Customers */}
      {tab === 'customers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {isAdmin && (
            <form
              onSubmit={handleAddCustomer}
              className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 space-y-4 h-fit"
            >
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Tambah Data Customer
              </h2>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Nama Perusahaan *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomer.companyName}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, companyName: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Nama PIC *</label>
                <input
                  type="text"
                  required
                  value={newCustomer.contactName}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, contactName: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Telepon</label>
                <input
                  type="text"
                  value={newCustomer.phone}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, phone: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) =>
                    setNewCustomer({ ...newCustomer, email: e.target.value })
                  }
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
              >
                Simpan Customer
              </button>
            </form>
          )}

          <div
            className={`${
              isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'
            } rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden`}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Direktori Customer ({customers.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {customers.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Belum ada customer terdaftar.
                </p>
              ) : (
                customers.map((c) => (
                  <div
                    key={c.id}
                    className="p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {c.companyName}{' '}
                        <span className="font-mono text-xs text-slate-400">
                          ({c.customerCode})
                        </span>
                      </p>
                      <p className="text-xs text-slate-500">
                        PIC: {c.contactName}
                        {c.phone ? ` · ${c.phone}` : ''}
                        {c.email ? ` · ${c.email}` : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Workshop Locations */}
      {tab === 'locations' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {isAdmin && (
            <form
              onSubmit={handleAddLocation}
              className="lg:col-span-4 rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-5 space-y-4 h-fit"
            >
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Tambah Area Lokasi Fisik
              </h2>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Nama Area Workshop *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: CNC Grinding Area"
                  value={newLoc.name}
                  onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
                  className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Deskripsi Fungsi</label>
                <textarea
                  rows={2}
                  value={newLoc.description}
                  onChange={(e) =>
                    setNewLoc({ ...newLoc, description: e.target.value })
                  }
                  className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl bg-industrial-600 text-white text-sm font-semibold cursor-pointer"
              >
                Tambah Lokasi
              </button>
            </form>
          )}

          <div
            className={`${
              isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'
            } rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden`}
          >
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Daftar Area Workshop ({locations.length})
              </h2>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {locations.map((loc) => (
                <div
                  key={loc.id}
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      <span className="font-mono text-xs text-industrial-600 mr-2">
                        {loc.code}
                      </span>
                      {loc.name}
                    </p>
                    <p className="text-xs text-slate-500">{loc.description}</p>
                  </div>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => handleToggleLocation(loc.id, !loc.isActive)}
                      className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        loc.isActive
                          ? 'border-green-600/40 text-green-700 dark:text-green-400'
                          : 'border-slate-300 text-slate-400'
                      }`}
                    >
                      {loc.isActive ? 'Aktif' : 'Nonaktif'}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {loc.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Security & Operational Audit Logs */}
      {tab === 'audit' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Jejak Audit Sistem (Audit Logs)
            </h2>
          </div>
          {auditLogs.length === 0 ? (
            <p className="p-8 text-center text-sm text-slate-500">
              Log audit tersedia untuk peran Admin, Supervisor, dan Manajemen.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="px-5 py-3.5 space-y-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-industrial-600">
                      {log.action} · {log.entityId}
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {new Date(log.createdAt).toLocaleString('id-ID')}
                    </span>
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{log.details}</p>
                  <p className="text-slate-400">
                    Oleh: {log.actorName} ({log.actorRole})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Progressive Web App (PWA), Supabase Database & Vercel HTTPS Deployment Guide */}
      {tab === 'guide' && (
        <div className="rounded-2xl bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <section className="space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              01. Instalasi sebagai Progressive Web App (PWA — Add to Home Screen)
            </h2>
            <p>
              <strong>WorkshopTrack — PT TJOKRO BERSAUDARA</strong> dibangun sebagai <strong>Progressive Web App (PWA)</strong> berbasis standar web modern dengan <code>manifest.json</code> dan <strong>Service Worker</strong> aktif. Karyawan workshop, admin, supervisor, dan manajemen dapat mengaksesnya melalui desktop, laptop, tablet, maupun smartphone tanpa perlu mengunduh file APK terpisah:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm">
              <li>
                <strong>Smartphone Android (Chrome / Edge):</strong> Buka URL HTTPS WorkshopTrack, ketuk tombol <em>Install Aplikasi (PWA)</em> di bawah atau pilih menu tiga titik browser → <strong>Tambahkan ke layar utama (Add to Home Screen)</strong>.
              </li>
              <li>
                <strong>iPhone &amp; iPad (Safari iOS):</strong> Ketuk ikon <strong>Bagikan (Share)</strong> di bilah bawah Safari → pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>.
              </li>
              <li>
                <strong>Desktop &amp; Laptop (Chrome / Edge):</strong> Klik ikon <strong>Install WorkshopTrack</strong> di sisi kanan bilah alamat (address bar) untuk membuka aplikasi pada jendela mandiri (standalone).
              </li>
            </ul>
            <div className="max-w-sm pt-1">
              <PWAInstallButton variant="mobile-sheet" />
            </div>
          </section>

          <section className="space-y-2 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              02. Database Terpusat PostgreSQL / Supabase &amp; Sinkronisasi Real-Time
            </h2>
            <p>
              Seluruh perubahan status perbaikan, progres aktivitas harian, dokumentasi foto, serta perpindahan antar-11 area workshop tersimpan permanen di database relasional <strong>PostgreSQL (12 tabel)</strong> melalui Drizzle ORM dan divalidasi oleh Role-Based Access Control (RBAC) di sisi server. Untuk menghubungkan ke <strong>Supabase PostgreSQL</strong> pada produksi mandiri:
            </p>
            <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`# Variabel Environment Database PostgreSQL (Supabase Connection Pooler / Cloud SQL):
SQL_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
SQL_PORT="5432"
SQL_USER="postgres.<project-ref>"
SQL_PASSWORD="<password-database-supabase>"
SQL_DB_NAME="postgres"
SQL_SSL="true"

# Push ke-12 tabel skema WorkshopTrack ke Supabase:
npx drizzle-kit push --config=./src/db/drizzle.config.ts`}
            </pre>
          </section>

          <section className="space-y-2 pt-6 border-t border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              03. Deployment Produksi Melalui Vercel dengan HTTPS
            </h2>
            <p>
              Proyek ini telah dilengkapi konfigurasi <code>vercel.json</code> dan bundel serverless API <code>api/index.js</code>. Protokol <strong>HTTPS</strong> otomatis disediakan oleh Vercel sehingga akses kamera browser smartphone (<code>navigator.mediaDevices.getUserMedia</code>) untuk pemindaian QR Code dan registrasi Service Worker PWA berjalan optimal di lapangan:
            </p>
            <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto">
{`# 1. Login & hubungkan repositori ke Vercel CLI (atau impor dari GitHub Dashboard Vercel)
npx vercel

# 2. Setel Environment Variables pada Vercel Project Settings:
#    SQL_HOST, SQL_PORT, SQL_USER, SQL_PASSWORD, SQL_DB_NAME, SQL_SSL="true"

# 3. Deploy ke produksi dengan HTTPS otomatis:
npx vercel --prod

# Alternatif Server Mandiri / Cloud Run (Express + WebSocket Real-Time Port 3000):
npm run build && NODE_ENV=production npm start`}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
};
