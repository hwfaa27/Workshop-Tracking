import React, { useState } from 'react';
import {
  BarChart3,
  Bell,
  CheckCheck,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  QrCode,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { NotificationRecord, ROLE_LABELS } from '../types/workshop';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from './PWAInstallPrompt';

export type NavTab =
  | 'dashboard'
  | 'scan'
  | 'items'
  | 'workorders'
  | 'technicians'
  | 'reports'
  | 'settings';

interface LayoutProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  selectedItemCode?: string | null;
  onClearSelectedItem: () => void;
  onOpenIncomingModal: () => void;
  notifications: NotificationRecord[];
  onMarkNotificationsRead: (id?: number) => void;
  onOpenItemById: (itemId: number) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'scan', label: 'Scan QR', shortLabel: 'Scan QR', icon: QrCode },
  { id: 'items', label: 'Barang', shortLabel: 'Barang', icon: Package },
  { id: 'workorders', label: 'Work Order', shortLabel: 'Work Order', icon: ClipboardList },
  { id: 'technicians', label: 'Teknisi', shortLabel: 'Teknisi', icon: Users },
  {
    id: 'reports',
    label: 'Laporan',
    shortLabel: 'Laporan',
    icon: FileSpreadsheet,
    roles: ['ADMIN', 'SUPERVISOR', 'MANAJEMEN'],
  },
  { id: 'settings', label: 'Pengaturan', shortLabel: 'Pengaturan', icon: Settings },
];

export const Layout: React.FC<LayoutProps> = ({
  activeTab,
  onSelectTab,
  selectedItemCode,
  onClearSelectedItem,
  onOpenIncomingModal,
  notifications,
  onMarkNotificationsRead,
  onOpenItemById,
  darkMode,
  onToggleDarkMode,
  children,
}) => {
  const { profile, signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter(
    (item) => !item.roles || (profile && item.roles.includes(profile.role))
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const activeNavObj = NAV_ITEMS.find((n) => n.id === activeTab);

  const handleNavClick = (tab: NavTab) => {
    onClearSelectedItem();
    onSelectTab(tab);
    setMobileMoreOpen(false);
  };

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar (#142D4E Navy Blue) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-navy-900 text-white border-r border-slate-800/40 z-30">
        <div className="h-14 px-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-industrial-600 flex items-center justify-center shrink-0">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <span className="font-display text-sm font-bold tracking-tight block leading-tight truncate">
              WorkshopTrack
            </span>
            <span className="text-[10px] font-semibold tracking-wider text-blue-300 block truncate">
              PT TJOKRO BERSAUDARA
            </span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id && !selectedItemCode;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full min-h-[42px] px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-industrial-600 text-white'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {profile && (
          <div className="p-4 border-t border-white/10 space-y-3">
            <PWAInstallButton variant="sidebar" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {profile.fullName}
              </p>
              <p className="text-xs text-slate-300 truncate">
                {ROLE_LABELS[profile.role]} · {profile.specialization}
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-white/10 hover:bg-red-600/80 text-xs text-slate-200 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar Contract (52px mobile, 56px desktop — strictly within 15% mobile sticky cap) */}
        <header className="sticky top-0 z-20 h-[52px] lg:h-14 bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Zone 1: Contextual Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <span className="lg:hidden font-display font-bold text-navy-900 dark:text-white whitespace-nowrap shrink-0">
              WorkshopTrack
            </span>
            <span className="lg:hidden text-slate-400">/</span>
            <button
              type="button"
              onClick={onClearSelectedItem}
              className={`font-medium truncate ${
                selectedItemCode
                  ? 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {activeNavObj?.label || 'Dashboard'}
            </button>
            {selectedItemCode && (
              <>
                <span className="text-slate-400">/</span>
                <span className="font-mono text-xs sm:text-sm font-semibold text-industrial-600 truncate tabular-nums">
                  {selectedItemCode}
                </span>
              </>
            )}
          </div>

          {/* Zone 3: Contextual Primary Action + Notification Bell */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Notifikasi"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold flex items-center justify-center tabular-nums">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {profile?.role === 'ADMIN' ? (
              <button
                type="button"
                onClick={onOpenIncomingModal}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-industrial-600 hover:bg-industrial-700 text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Barang Masuk</span>
                <span className="sm:hidden">Terima</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleNavClick('scan')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-industrial-600 hover:bg-industrial-700 text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan QR</span>
              </button>
            )}
          </div>
        </header>

        {/* Scrollable Workspace Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-10 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Smartphone Fixed Bottom Navigation (60px height -> Total sticky = 112px < 15% cap) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-[60px] bg-white/95 dark:bg-surface-dark/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1">
        {[
          { id: 'dashboard' as NavTab, label: 'Dashboard', icon: BarChart3 },
          { id: 'scan' as NavTab, label: 'Scan QR', icon: QrCode },
          { id: 'items' as NavTab, label: 'Barang', icon: Package },
          { id: 'workorders' as NavTab, label: 'Work Order', icon: ClipboardList },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id && !selectedItemCode;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleNavClick(tab.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'text-industrial-600 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMobileMoreOpen(true)}
          className={`min-h-[48px] flex flex-col items-center justify-center rounded-lg transition-colors ${
            ['technicians', 'reports', 'settings'].includes(activeTab)
              ? 'text-industrial-600 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">
            Lainnya
          </span>
        </button>
      </nav>

      {/* Mobile "Lainnya" Action Sheet */}
      {mobileMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto" />
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {profile?.fullName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {profile ? ROLE_LABELS[profile.role] : ''} · {profile?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1">
              {visibleNav
                .filter((n) => ['technicians', 'reports', 'settings'].includes(n.id))
                .map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavClick(item.id)}
                      className="w-full min-h-[48px] px-4 rounded-xl flex items-center gap-3 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Icon className="w-5 h-5 text-industrial-600" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
            </div>

            <PWAInstallButton variant="mobile-sheet" />

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onToggleDarkMode}
                className="min-h-[46px] rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center justify-center gap-2"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>
              </button>
              <button
                type="button"
                onClick={signOut}
                className="min-h-[46px] rounded-xl bg-red-600 text-white text-xs font-medium flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar Akun</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Notification Drawer */}
      {notifOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-surface-dark h-full border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Notifikasi Operasional
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pembaruan status, penugasan, dan lokasi barang secara real-time
                </p>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkNotificationsRead()}
                    className="min-h-[40px] px-2.5 text-xs font-medium text-industrial-600 hover:underline flex items-center gap-1 whitespace-nowrap"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Tandai Dibaca</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Belum ada notifikasi aktivitas workshop.
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => {
                      onMarkNotificationsRead(n.id);
                      if (n.itemId) {
                        onOpenItemById(n.itemId);
                        setNotifOpen(false);
                      }
                    }}
                    className={`w-full text-left px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors space-y-1 ${
                      !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white">
                        {n.title}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 whitespace-nowrap tabular-nums">
                        {new Date(n.createdAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {n.message}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
