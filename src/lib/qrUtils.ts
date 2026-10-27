import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { WorkOrderItemSummary } from '../types/workshop';

export interface PrintableQrItem {
  woNumber: string;
  itemCode: string;
  qrToken: string;
  itemName: string;
  companyName: string;
  receivedAt: string;
}

export function buildQrPayload(qrToken: string): string {
  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://workshoptrack.local';
  return `${origin}/?qr=${encodeURIComponent(qrToken)}`;
}

export function extractQrIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const parsed = new URL(trimmed);
      const qrParam = parsed.searchParams.get('qr');
      if (qrParam) return qrParam.trim();
    }
  } catch {
    // Fallback to plain token extraction
  }

  if (trimmed.toUpperCase().startsWith('WORKSHOPTRACK:')) {
    return trimmed.slice('WORKSHOPTRACK:'.length).trim();
  }

  return trimmed;
}

export async function generateQrCodeDataUrl(
  qrToken: string,
  width = 320
): Promise<string> {
  return await QRCode.toDataURL(buildQrPayload(qrToken), {
    width,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#142D4E',
      light: '#FFFFFF',
    },
  });
}

export function formatIndonesianShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function renderIndustrialLabelPng(
  item: PrintableQrItem
): Promise<string> {
  const qrDataUrl = await generateQrCodeDataUrl(item.qrToken, 360);

  const canvas = document.createElement('canvas');
  canvas.width = 880;
  canvas.height = 520;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak didukung pada perangkat ini.');

  // Background & outer border
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#142D4E';
  ctx.lineWidth = 6;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

  // Header bar (#142D4E Navy Blue)
  ctx.fillStyle = '#142D4E';
  ctx.fillRect(16, 16, canvas.width - 32, 82);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('WORKSHOPTRACK', 44, 68);

  ctx.font = '600 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(item.woNumber, canvas.width - 44, 66);
  ctx.textAlign = 'left';

  // Left metadata column
  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px "DM Sans", sans-serif';
  ctx.fillText('KODE BARANG', 44, 148);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px "JetBrains Mono", monospace';
  ctx.fillText(item.itemCode, 44, 182);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px "DM Sans", sans-serif';
  ctx.fillText('ITEM KOMPONEN', 44, 232);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 26px "Plus Jakarta Sans", sans-serif';
  const truncatedItem =
    item.itemName.length > 24 ? `${item.itemName.slice(0, 23)}…` : item.itemName;
  ctx.fillText(`Item: ${truncatedItem}`, 44, 266);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px "DM Sans", sans-serif';
  ctx.fillText('CUSTOMER / PERUSAHAAN', 44, 316);
  ctx.fillStyle = '#0F172A';
  ctx.font = '600 22px "DM Sans", sans-serif';
  const truncatedCust =
    item.companyName.length > 27
      ? `${item.companyName.slice(0, 26)}…`
      : item.companyName;
  ctx.fillText(`Customer: ${truncatedCust}`, 44, 348);

  ctx.fillStyle = '#64748B';
  ctx.font = '600 16px "DM Sans", sans-serif';
  ctx.fillText('TANGGAL DITERIMA', 44, 402);
  ctx.fillStyle = '#142D4E';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.fillText(`Received: ${formatIndonesianShortDate(item.receivedAt)}`, 44, 434);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 14px "DM Sans", sans-serif';
  ctx.fillText('Scan QR Code untuk status, lokasi & riwayat pengerjaan', 44, 476);

  // Right QR Code box
  const qrImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  ctx.strokeStyle = '#CBD5E1';
  ctx.lineWidth = 2;
  ctx.strokeRect(556, 126, 276, 276);
  ctx.drawImage(qrImg, 566, 136, 256, 256);

  ctx.fillStyle = '#475569';
  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(item.qrToken, 694, 432);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}

export async function downloadQrLabelPng(item: PrintableQrItem): Promise<void> {
  const pngUrl = await renderIndustrialLabelPng(item);
  const link = document.createElement('a');
  link.href = pngUrl;
  link.download = `Label-QR-${item.itemCode}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadQrLabelsPdf(
  items: PrintableQrItem[],
  filename = 'Label-QR-WorkshopTrack.pdf'
): Promise<void> {
  if (items.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  // 2 labels per row, 3 rows per A4 page (6 labels per page, crisp industrial tag size)
  const labelWidth = 92;
  const labelHeight = 78;
  const marginX = 11;
  const marginY = 16;
  const gapX = 4;
  const gapY = 8;

  for (let i = 0; i < items.length; i++) {
    const posOnPage = i % 6;
    if (i > 0 && posOnPage === 0) {
      doc.addPage();
    }

    const col = posOnPage % 2;
    const row = Math.floor(posOnPage / 2);
    const x = marginX + col * (labelWidth + gapX);
    const y = marginY + row * (labelHeight + gapY);

    const item = items[i];
    const qrDataUrl = await generateQrCodeDataUrl(item.qrToken, 300);

    // Outer border
    doc.setDrawColor(20, 45, 78);
    doc.setLineWidth(0.6);
    doc.rect(x, y, labelWidth, labelHeight);

    // Header
    doc.setFillColor(20, 45, 78);
    doc.rect(x, y, labelWidth, 11, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('WORKSHOPTRACK', x + 3.5, y + 7.2);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.5);
    doc.text(item.woNumber, x + labelWidth - 3.5, y + 7.2, { align: 'right' });

    // Content text
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    const cleanItem =
      item.itemName.length > 22 ? `${item.itemName.slice(0, 21)}...` : item.itemName;
    doc.text(`Item: ${cleanItem}`, x + 3.5, y + 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    const cleanCust =
      item.companyName.length > 26
        ? `${item.companyName.slice(0, 25)}...`
        : item.companyName;
    doc.text(`Customer: ${cleanCust}`, x + 3.5, y + 23.5);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8.2);
    doc.text(`Kode: ${item.itemCode}`, x + 3.5, y + 29);

    // Centered QR Code
    doc.addImage(qrDataUrl, 'PNG', x + (labelWidth - 34) / 2, y + 32, 34, 34);

    // Footer Received Date
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(20, 45, 78);
    doc.text(
      `Received: ${formatIndonesianShortDate(item.receivedAt)}`,
      x + labelWidth / 2,
      y + 72.5,
      { align: 'center' }
    );
  }

  doc.save(filename);
}

export async function compressImageFile(
  file: File,
  maxDimension = 1080,
  quality = 0.78
): Promise<{ fileName: string; mimeType: string; dataUrl: string }> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = rawDataUrl;
  });

  let { width, height } = img;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      fileName: file.name,
      mimeType: file.type || 'image/jpeg',
      dataUrl: rawDataUrl,
    };
  }
  ctx.drawImage(img, 0, 0, width, height);
  const compressed = canvas.toDataURL('image/jpeg', quality);
  return {
    fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    dataUrl: compressed,
  };
}

export function toPrintableQrItem(item: WorkOrderItemSummary): PrintableQrItem {
  return {
    woNumber: item.woNumber,
    itemCode: item.itemCode,
    qrToken: item.qrToken,
    itemName: item.itemName,
    companyName: item.companyName,
    receivedAt: item.receivedAt,
  };
}
