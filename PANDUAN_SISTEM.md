# WORKSHOPTRACK – SMART WORKSHOP TRACKING SYSTEM (WEB / PWA)
**PT TJOKRO BERSAUDARA**

Dokumentasi Teknis Progressive Web App (PWA), Database Terpusat PostgreSQL / Supabase, dan Deployment HTTPS melalui Vercel maupun Cloud Run.

---

## 1. Ringkasan Arsitektur Aplikasi Web (PWA)

- **Platform**: Progressive Web App (PWA) lintas perangkat — diakses melalui browser Desktop, Laptop, Tablet, dan Smartphone (Android & iOS) tanpa memerlukan instalasi APK native.
- **Responsive Navigation**:
  - **Desktop / Laptop (`lg:`)**: Sidebar kiri permanen berwarna Navy Industrial (`#142D4E`).
  - **Smartphone & Mobile**: Header ringkas + Fixed Bottom Navigation (`Dashboard`, `Scan QR`, `Barang`, `Work Order`, `Lainnya`).
- **PWA Compliance**:
  - Web App Manifest (`/manifest.json`) dengan `display: "standalone"`, `short_name: "WorkshopTrk"`, shortcut langsung ke `Scan QR Barang`, serta set ikon `192x192`, `512x512` (`any`), `512x512` (`maskable` dengan safe-zone 15%), dan `apple-touch-icon.png` (`180x180`).
  - Service Worker otomatis (`vite-plugin-pwa` + Workbox) untuk caching shell aplikasi, font, aset statis, dan deteksi status koneksi (`OfflineIndicator`).
  - Tombol instalasi dalam aplikasi (**Add to Home Screen**) untuk Chrome/Edge/Android (`beforeinstallprompt`) dan panduan interaktif untuk Safari iOS.
- **Sistem QR Code Prioritas Operasional**:
  - **Generator QR**: Membuat token aman unik (`wtk_...`) saat Work Order didaftarkan; unduh PNG atau cetak label PDF.
  - **Scanner Kamera Browser**: Pemindaian real-time melalui `navigator.mediaDevices.getUserMedia` + `jsQR`, dilengkapi kontrol senter kamera belakang (`torch`), unggah foto QR, dukungan scanner USB/Bluetooth HID, serta pencarian manual.
  - **Eksekusi Cepat Hasil Scan**: Endpoint transaksi atomik `POST /api/items/:id/quick-scan-update` memungkinkan teknisi memperbarui status perbaikan, progres harian, foto dokumentasi, dan perpindahan lokasi area workshop sekaligus dalam satu klik.
- **Autentikasi & RBAC Server**: 4 peran pengguna (**Admin**, **Supervisor**, **Teknisi**, **Manajemen**) divalidasi penuh pada middleware backend (`src/middleware/auth.ts` & `src/db/repository.ts`).

---

## 2. Konfigurasi Database Terpusat (Supabase PostgreSQL / Cloud SQL)

Seluruh perubahan status, histori lokasi, penugasan teknisi, dan audit log disimpan permanen di 12 tabel relasional PostgreSQL (`src/db/schema.ts`):
`users`, `customers`, `item_locations`, `work_orders`, `work_order_items`, `repair_activities`, `technician_assignments`, `status_history`, `movement_history`, `attachments`, `notifications`, dan `audit_logs`.

### Menghubungkan ke Supabase PostgreSQL
1. Buat project baru di dashboard **Supabase**.
2. Salin parameter koneksi PostgreSQL dari menu **Project Settings → Database → Connection Pooler (Session / Transaction Mode)**:
   ```env
   SQL_HOST="aws-0-ap-southeast-1.pooler.supabase.com"
   SQL_PORT="5432"
   SQL_USER="postgres.<project-ref>"
   SQL_PASSWORD="<password-database-anda>"
   SQL_DB_NAME="postgres"
   SQL_SSL="true"
   ```
3. Dorong skema 12 tabel Drizzle ke database Supabase:
   ```bash
   npx drizzle-kit push --config=./src/db/drizzle.config.ts
   ```
4. Aktifkan replikasi publikasi real-time pada tabel operasional jika diperlukan di SQL Editor Supabase:
   ```sql
   ALTER PUBLICATION supabase_realtime ADD TABLE work_order_items, status_history, movement_history, notifications;
   ```

---

## 3. Panduan Deployment ke Vercel dengan HTTPS

Aplikasi telah dilengkapi berkas `vercel.json` dan serverless API handler `api/index.ts`. HTTPS otomatis dari Vercel memastikan **Service Worker PWA** dan **Kamera QR Scanner** berfungsi penuh di seluruh smartphone karyawan.

### Langkah Deployment Vercel
1. Unggah kode project ke repositori GitHub / GitLab, atau jalankan Vercel CLI dari direktori project:
   ```bash
   npx vercel
   ```
2. Pada dashboard **Vercel → Project Settings → Environment Variables**, tambahkan variabel koneksi database PostgreSQL (`SQL_HOST`, `SQL_PORT`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`, `SQL_SSL="true"`).
3. Jalankan deployment produksi:
   ```bash
   npx vercel --prod
   ```

### Alternatif Deployment Full-Stack Container (Cloud Run / Docker / VPS)
Jika menggunakan server Node.js persisten dengan dukungan WebSocket `/ws` penuh pada port `3000`:
```bash
npm install
npm run build
NODE_ENV=production npm start
```

---

## 4. Cara Memasang sebagai PWA (Add to Home Screen)

1. **Android (Google Chrome / Microsoft Edge)**:
   - Buka alamat HTTPS aplikasi WorkshopTrack.
   - Ketuk tombol **Install Aplikasi (PWA)** pada halaman login / menu aplikasi, atau ketuk menu tiga titik browser → **Tambahkan ke layar utama (Add to Home screen)**.
2. **iOS / iPadOS (Safari)**:
   - Buka alamat HTTPS aplikasi di Safari.
   - Ketuk ikon **Bagikan (Share)** → pilih **Tambah ke Layar Utama (Add to Home Screen)**.
3. **Desktop / Laptop (Chrome / Edge)**:
   - Klik ikon **Install WorkshopTrack** pada sisi kanan bilah alamat browser.
