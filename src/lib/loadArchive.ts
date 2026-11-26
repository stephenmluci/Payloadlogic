import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Address, Client, Load } from '@/types';
import { getUnifiedLoadStatusDisplay } from '@/lib/loadStatus';

export const RECENT_COMPLETED_MAX_COUNT = 12;
export const RECENT_COMPLETED_MAX_DAYS = 7;

export interface ArchiveFilterOptions {
  loadQuery?: string;
  clientId?: string;
  month?: string; // YYYY-MM
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
}

function toValidDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    return isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'object' && raw !== null) {
    const maybeTs = raw as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      const d = maybeTs.toDate();
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof maybeTs.seconds === 'number') {
      const d = new Date(maybeTs.seconds * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Returns the primary completion/activity date for a completed load.
 */
export function getLoadCompletionDate(load: Load): Date | null {
  return (
    toValidDate(load.deliveredAt) ||
    toValidDate(load.deliveryDateTime) ||
    toValidDate(load.pickupDateTime) ||
    toValidDate((load as any).createdAt) ||
    null
  );
}

/**
 * Sorts completed loads newest-first by completion date.
 */
export function sortCompletedLoadsNewestFirst(loads: Load[]): Load[] {
  return [...loads].sort((a, b) => {
    const da = getLoadCompletionDate(a)?.getTime() ?? 0;
    const db = getLoadCompletionDate(b)?.getTime() ?? 0;
    return db - da;
  });
}

/**
 * Returns only the most recent `maxCount` completed loads within the last `maxDays` days
 * (whichever is fewer).
 */
export function getRecentCompletedLoads(
  completedLoads: Load[],
  maxCount = RECENT_COMPLETED_MAX_COUNT,
  maxDays = RECENT_COMPLETED_MAX_DAYS,
  nowMs = Date.now(),
): Load[] {
  const sorted = sortCompletedLoadsNewestFirst(completedLoads);
  const cutoffMs = nowMs - maxDays * 24 * 60 * 60 * 1000;
  const withinWindow = sorted.filter((load) => {
    const d = getLoadCompletionDate(load);
    return d ? d.getTime() >= cutoffMs : false;
  });
  return withinWindow.slice(0, maxCount);
}

export function resolveLoadClientName(load: Load, clients: Client[]): string {
  const matched = clients.find((c) => c.id === load.clientId);
  return matched?.companyName || load.clientName || (load as any).companyName || 'Unassigned Client';
}

function formatAddressShort(addr?: Address): string {
  if (!addr) return '';
  const cityState = [addr.city, addr.state].filter(Boolean).join(', ');
  return cityState || addr.street || addr.zip || '';
}

function parseLocalDateStart(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseLocalDateEnd(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

/**
 * Filters completed loads by load ID/text query, client, month, and/or date range.
 */
export function filterArchivedLoads(
  completedLoads: Load[],
  filters: ArchiveFilterOptions,
  clients: Client[],
): Load[] {
  const sorted = sortCompletedLoadsNewestFirst(completedLoads);
  const q = (filters.loadQuery || '').trim().toLowerCase();
  const clientFilter = (filters.clientId || '').trim();

  let rangeStart: Date | null = filters.startDate ? parseLocalDateStart(filters.startDate) : null;
  let rangeEnd: Date | null = filters.endDate ? parseLocalDateEnd(filters.endDate) : null;

  if (!rangeStart && !rangeEnd && filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    const [y, m] = filters.month.split('-').map(Number);
    rangeStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
    rangeEnd = new Date(y, m, 0, 23, 59, 59, 999);
  }

  return sorted.filter((load) => {
    if (clientFilter && clientFilter !== 'all') {
      if (load.clientId !== clientFilter) return false;
    }

    if (q) {
      const clientName = resolveLoadClientName(load, clients).toLowerCase();
      const originStr = formatAddressShort(load.origin).toLowerCase();
      const destStr = formatAddressShort(load.destination).toLowerCase();
      const matches =
        (load.loadNumber || '').toLowerCase().includes(q) ||
        (load.id || '').toLowerCase().includes(q) ||
        clientName.includes(q) ||
        originStr.includes(q) ||
        destStr.includes(q) ||
        (load.cargoDescription || '').toLowerCase().includes(q);
      if (!matches) return false;
    }

    if (rangeStart || rangeEnd) {
      const d = getLoadCompletionDate(load);
      if (!d) return false;
      const ms = d.getTime();
      if (rangeStart && ms < rangeStart.getTime()) return false;
      if (rangeEnd && ms > rangeEnd.getTime()) return false;
    }

    return true;
  });
}

export function computeLoadTotalExpenses(load: Load): number {
  const exp = load.expenses || ({} as Load['expenses']);
  return (
    (Number(exp.payroll) || 0) +
    (Number(exp.actualFuel ?? exp.fuel) || 0) +
    (Number(exp.def) || 0) +
    (Number(exp.maintenance) || 0) +
    (Number(exp.recurring) || 0)
  );
}

export function computeArchiveSummary(loads: Load[]) {
  return loads.reduce(
    (acc, load) => {
      const revenue = Number(load.totalAgreedRate) || 0;
      const totalExp = computeLoadTotalExpenses(load);
      acc.count += 1;
      acc.totalRevenue += revenue;
      acc.totalExpenses += totalExp;
      acc.netProfit += revenue - totalExp;
      acc.totalLoadedMiles += Number(load.distance) || 0;
      acc.totalDeadheadMiles += Number(load.deadheadMiles) || 0;
      return acc;
    },
    {
      count: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      totalLoadedMiles: 0,
      totalDeadheadMiles: 0,
    },
  );
}

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatDateIsoShort(d: Date | null): string {
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function exportArchivedLoadsToCsv(
  loads: Load[],
  clients: Client[],
  filenameSuffix?: string,
): void {
  const headers = [
    'Load ID',
    'Status',
    'Completed Date',
    'Pickup Date',
    'Delivery Date',
    'Client',
    'Origin',
    'Destination',
    'Loaded Miles',
    'Deadhead Miles',
    'Rate Per Mile',
    'Tarping Fee',
    'Total Agreed Rate',
    'Fuel Expense',
    'Payroll Expense',
    'DEF Expense',
    'Maintenance Expense',
    'Recurring Expense',
    'Total Expenses',
    'Net Profit',
    'Driver',
    'Cargo Description',
  ];

  const rows = loads.map((load) => {
    const completedDate = formatDateIsoShort(getLoadCompletionDate(load));
    const pickupDate = formatDateIsoShort(toValidDate(load.pickupDateTime));
    const deliveryDate = formatDateIsoShort(toValidDate(load.deliveryDateTime));
    const clientName = resolveLoadClientName(load, clients);
    const statusLabel = getUnifiedLoadStatusDisplay(load).label;
    const exp = load.expenses || ({} as Load['expenses']);
    const fuel = Number(exp.actualFuel ?? exp.fuel) || 0;
    const payroll = Number(exp.payroll) || 0;
    const def = Number(exp.def) || 0;
    const maintenance = Number(exp.maintenance) || 0;
    const recurring = Number(exp.recurring) || 0;
    const totalExp = fuel + payroll + def + maintenance + recurring;
    const revenue = Number(load.totalAgreedRate) || 0;
    const netProfit = revenue - totalExp;

    return [
      load.loadNumber || load.id || '',
      statusLabel,
      completedDate,
      pickupDate,
      deliveryDate,
      clientName,
      formatAddressShort(load.origin),
      formatAddressShort(load.destination),
      Number(load.distance) || 0,
      Number(load.deadheadMiles) || 0,
      Number(load.ratePerMile) || 0,
      Number(load.tarpingFee) || 0,
      revenue.toFixed(2),
      fuel.toFixed(2),
      payroll.toFixed(2),
      def.toFixed(2),
      maintenance.toFixed(2),
      recurring.toFixed(2),
      totalExp.toFixed(2),
      netProfit.toFixed(2),
      load.assignedDriverName || '',
      load.cargoDescription || '',
    ].map(escapeCsvCell).join(',');
  });

  const csvContent = [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = filenameSuffix || formatDateIsoShort(new Date());
  link.href = url;
  link.download = `payloadlogic-completed-loads-${suffix}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function exportArchivedLoadsToPdf(
  loads: Load[],
  clients: Client[],
  dateRangeLabel: string,
  filenameSuffix?: string,
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 40;
  const summary = computeArchiveSummary(loads);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawHeader = () => {
    page.drawText('PayloadLogic — Completed Loads Archive Report', {
      x: margin,
      y,
      size: 15,
      font: boldFont,
      color: rgb(0.07, 0.11, 0.18),
    });
    y -= 18;
    page.drawText(`Date Range: ${dateRangeLabel}   |   Generated: ${formatDateIsoShort(new Date())}`, {
      x: margin,
      y,
      size: 9,
      font,
      color: rgb(0.35, 0.4, 0.48),
    });
    y -= 18;
    page.drawText(
      `Loads: ${summary.count}   |   Revenue: $${summary.totalRevenue.toFixed(2)}   |   Expenses: $${summary.totalExpenses.toFixed(2)}   |   Net Profit: $${summary.netProfit.toFixed(2)}   |   Loaded Miles: ${summary.totalLoadedMiles.toLocaleString()}`,
      {
        x: margin,
        y,
        size: 9,
        font: boldFont,
        color: rgb(0.1, 0.25, 0.5),
      },
    );
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 1,
      color: rgb(0.8, 0.84, 0.9),
    });
    y -= 16;

    // Table header
    const cols = [
      { label: 'Load ID', x: margin },
      { label: 'Date', x: margin + 78 },
      { label: 'Client', x: margin + 142 },
      { label: 'Route', x: margin + 265 },
      { label: 'Miles', x: margin + 412 },
      { label: 'Revenue', x: margin + 455 },
      { label: 'Net', x: margin + 505 },
    ];
    for (const col of cols) {
      page.drawText(col.label, { x: col.x, y, size: 8, font: boldFont, color: rgb(0.25, 0.3, 0.38) });
    }
    y -= 12;
  };

  drawHeader();

  for (const load of loads) {
    if (y < margin + 30) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
      drawHeader();
    }

    const idStr = String(load.loadNumber || load.id || '').slice(0, 14);
    const dateStr = formatDateIsoShort(getLoadCompletionDate(load)) || '-';
    const clientStr = resolveLoadClientName(load, clients).slice(0, 22);
    const routeStr = `${formatAddressShort(load.origin)} -> ${formatAddressShort(load.destination)}`.slice(0, 28);
    const milesStr = String(Number(load.distance) || 0);
    const rev = Number(load.totalAgreedRate) || 0;
    const net = rev - computeLoadTotalExpenses(load);

    page.drawText(idStr, { x: margin, y, size: 8, font });
    page.drawText(dateStr, { x: margin + 78, y, size: 8, font });
    page.drawText(clientStr, { x: margin + 142, y, size: 8, font });
    page.drawText(routeStr, { x: margin + 265, y, size: 8, font });
    page.drawText(milesStr, { x: margin + 412, y, size: 8, font });
    page.drawText(`$${rev.toFixed(0)}`, { x: margin + 455, y, size: 8, font });
    page.drawText(`$${net.toFixed(0)}`, { x: margin + 505, y, size: 8, font });
    y -= 14;
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const suffix = filenameSuffix || formatDateIsoShort(new Date());
  link.href = url;
  link.download = `payloadlogic-completed-loads-${suffix}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
