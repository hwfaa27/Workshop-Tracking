import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  CustomerRecord,
  LocationRecord,
  NotificationRecord,
  UserProfile,
  WorkOrderItemDetail,
  WorkOrderItemSummary,
  WorkOrderRecord,
} from './types/workshop';
import { LoginScreen } from './components/LoginScreen';
import { Layout, NavTab } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { QrScannerView } from './components/QrScannerView';
import { ItemsView } from './components/ItemsView';
import { ItemDetailView } from './components/ItemDetailView';
import { WorkOrdersView } from './components/WorkOrdersView';
import { TechniciansView } from './components/TechniciansView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { IncomingGoodsModal } from './components/IncomingGoodsModal';
import { QrLabelModal } from './components/QrLabelModal';
import { OfflineIndicator } from './components/PWAInstallPrompt';
import { toPrintableQrItem } from './lib/qrUtils';

const WorkshopWorkspace: React.FC = () => {
  const { profile, loading, wsConnected, apiFetch, subscribeSync } = useAuth();

  // Preserve scanned ?qr=TOKEN from URL across authentication
  const [pendingQrToken, setPendingQrToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('qr');
  });

  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'scan' ? 'scan' : 'dashboard';
  });
  const [selectedItem, setSelectedItem] = useState<WorkOrderItemDetail | null>(
    null
  );
  const [openedFromScanner, setOpenedFromScanner] = useState(false);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);
  const [newlyCreatedWo, setNewlyCreatedWo] = useState<WorkOrderRecord | null>(
    null
  );
  const [bannerError, setBannerError] = useState<string | null>(null);

  // Master operational states synced from PostgreSQL
  const [items, setItems] = useState<WorkOrderItemSummary[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const loadOperationalData = useCallback(async () => {
    if (!profile) return;
    try {
      const [itemsRes, woRes, custRes, locRes, userRes, notifRes] =
        await Promise.all([
          apiFetch<{ items: WorkOrderItemSummary[] }>('/api/items'),
          apiFetch<{ workOrders: WorkOrderRecord[] }>('/api/work-orders'),
          apiFetch<{ customers: CustomerRecord[] }>('/api/customers'),
          apiFetch<{ locations: LocationRecord[] }>('/api/locations'),
          apiFetch<{ users: UserProfile[] }>('/api/users'),
          apiFetch<{ notifications: NotificationRecord[] }>('/api/notifications'),
        ]);

      setItems(itemsRes.items);
      setWorkOrders(woRes.workOrders);
      setCustomers(custRes.customers);
      setLocations(locRes.locations);
      setUsers(userRes.users);
      setNotifications(notifRes.notifications);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Gagal menyinkronkan data workshop.'
      );
    }
  }, [profile, apiFetch]);

  const openItemByIdentifier = useCallback(
    async (identifier: string | number, fromScanner = false) => {
      const res = await apiFetch<{ item: WorkOrderItemDetail }>(
        `/api/items/${encodeURIComponent(String(identifier))}`
      );
      setOpenedFromScanner(fromScanner);
      setSelectedItem(res.item);
      setBannerError(null);
    },
    [apiFetch]
  );

  const handleSelectItemSafe = useCallback(
    (identifier: string | number, fromScanner = false) => {
      openItemByIdentifier(identifier, fromScanner).catch((err) => {
        setBannerError(
          err instanceof Error
            ? err.message
            : 'Gagal memuat detail barang dari server.'
        );
      });
    },
    [openItemByIdentifier]
  );

  useEffect(() => {
    if (profile) {
      loadOperationalData();
    }
  }, [profile, loadOperationalData]);

  // Resolve deep-linked QR Code immediately after login
  useEffect(() => {
    if (profile && pendingQrToken) {
      const tokenToOpen = pendingQrToken;
      setPendingQrToken(null);
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      openItemByIdentifier(tokenToOpen, true).catch((err) => {
        setBannerError(
          err instanceof Error
            ? err.message
            : 'Token QR Code tidak ditemukan dalam database.'
        );
      });
    }
  }, [profile, pendingQrToken, openItemByIdentifier]);

  // Real-time WebSocket delta subscription
  useEffect(() => {
    return subscribeSync((_event, entityId) => {
      loadOperationalData();
      if (selectedItem && (!entityId || String(selectedItem.id) === entityId)) {
        openItemByIdentifier(selectedItem.id, openedFromScanner).catch(() => {});
      }
    });
  }, [
    subscribeSync,
    loadOperationalData,
    selectedItem,
    openedFromScanner,
    openItemByIdentifier,
  ]);

  // Serverless / HTTPS multi-device sync fallback (active when deployed on Vercel without long-lived WS)
  useEffect(() => {
    if (!profile || wsConnected) return;

    const syncNow = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        loadOperationalData();
        if (selectedItem) {
          openItemByIdentifier(selectedItem.id, openedFromScanner).catch(
            () => {}
          );
        }
      }
    };

    const intervalId = window.setInterval(syncNow, 12000);
    window.addEventListener('focus', syncNow);
    document.addEventListener('visibilitychange', syncNow);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncNow);
      document.removeEventListener('visibilitychange', syncNow);
    };
  }, [
    profile,
    wsConnected,
    loadOperationalData,
    selectedItem,
    openedFromScanner,
    openItemByIdentifier,
  ]);

  const handleMarkNotificationsRead = async (notificationId?: number) => {
    try {
      await apiFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notificationId }),
      });
      const notifRes = await apiFetch<{ notifications: NotificationRecord[] }>(
        '/api/notifications'
      );
      setNotifications(notifRes.notifications);
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Gagal memperbarui status notifikasi.'
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-industrial-600 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Menyiapkan ruang kerja WorkshopTrack...
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <LoginScreen pendingQrToken={pendingQrToken} />;
  }

  return (
    <Layout
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      selectedItemCode={selectedItem?.itemCode || null}
      onClearSelectedItem={() => {
        setSelectedItem(null);
        setOpenedFromScanner(false);
      }}
      onOpenIncomingModal={() => setIncomingModalOpen(true)}
      notifications={notifications}
      onMarkNotificationsRead={handleMarkNotificationsRead}
      onOpenItemById={(itemId) => handleSelectItemSafe(itemId)}
      darkMode={darkMode}
      onToggleDarkMode={() => setDarkMode((d) => !d)}
    >
      {bannerError && (
        <div className="mb-5 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            className="font-semibold underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {selectedItem ? (
        <ItemDetailView
          item={selectedItem}
          locations={locations}
          users={users}
          openedFromScanner={openedFromScanner}
          onScanAnother={() => {
            setSelectedItem(null);
            setOpenedFromScanner(false);
            setActiveTab('scan');
          }}
          onBack={() => {
            setSelectedItem(null);
            setOpenedFromScanner(false);
          }}
          onUpdated={(updated) => {
            setSelectedItem(updated);
            loadOperationalData();
          }}
        />
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardView
              customers={customers}
              locations={locations}
              users={users}
              onOpenItem={(id) => handleSelectItemSafe(id, false)}
              onOpenIncoming={() => setIncomingModalOpen(true)}
              onRefreshAll={loadOperationalData}
            />
          )}

          {activeTab === 'scan' && (
            <QrScannerView
              items={items}
              onResolveIdentifier={(identifier) =>
                openItemByIdentifier(identifier, true)
              }
              onSelectItem={(id) => handleSelectItemSafe(id, true)}
            />
          )}

          {activeTab === 'items' && (
            <ItemsView
              items={items}
              locations={locations}
              onSelectItem={(id) => handleSelectItemSafe(id)}
            />
          )}

          {activeTab === 'workorders' && (
            <WorkOrdersView
              workOrders={workOrders}
              onOpenIncomingModal={() => setIncomingModalOpen(true)}
              onSelectItem={(id) => handleSelectItemSafe(id)}
              onRefresh={loadOperationalData}
            />
          )}

          {activeTab === 'technicians' && (
            <TechniciansView
              users={users}
              items={items}
              onSelectItem={(id) => handleSelectItemSafe(id)}
              onGoToSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'reports' && <ReportsView users={users} />}

          {activeTab === 'settings' && (
            <SettingsView
              users={users}
              customers={customers}
              locations={locations}
              onRefreshAll={loadOperationalData}
            />
          )}
        </>
      )}

      {incomingModalOpen && (
        <IncomingGoodsModal
          customers={customers}
          locations={locations}
          onClose={() => setIncomingModalOpen(false)}
          onCreated={async (wo) => {
            setIncomingModalOpen(false);
            await loadOperationalData();
            setNewlyCreatedWo(wo);
          }}
        />
      )}

      {newlyCreatedWo && (
        <QrLabelModal
          title={`Work Order ${newlyCreatedWo.woNumber} Berhasil Dibuat`}
          items={newlyCreatedWo.items.map(toPrintableQrItem)}
          itemIds={newlyCreatedWo.items.map((i) => i.id)}
          onClose={() => setNewlyCreatedWo(null)}
        />
      )}

      <OfflineIndicator />
    </Layout>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <WorkshopWorkspace />
    </AuthProvider>
  );
}
