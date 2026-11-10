import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate, formatDateTime, monthLabel } from './dates';
import { amountInWords, asset, days as fmtDays, moneyPlain } from './format';
import { PENALTY_CATEGORIES, type Employee, type OrgSettings } from './types';
import type { PayrollResult } from './salary';

type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
const finalY = (doc: jsPDF) => (doc as DocWithTable).lastAutoTable?.finalY ?? 40;

const BRAND: [number, number, number] = [31, 69, 235];

// Company logo for PDFs – loaded once in the background when this module is first used.
let logo: { data: string; ratio: number } | null = null;
if (typeof window !== 'undefined') {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')?.drawImage(img, 0, 0);
    logo = { data: c.toDataURL('image/png'), ratio: img.naturalHeight / img.naturalWidth };
  };
  img.src = asset('logo.png');
}

export interface SlipInput {
  employee: Employee;
  result: PayrollResult;
  settings: Pick<OrgSettings, 'company_name' | 'company_address'>;
  finalizedAt?: string | null;
}

function drawSlip(doc: jsPDF, { employee, result: r, settings, finalizedAt }: SlipInput) {
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  // header: logo + address on the left, title on the right, brand rule underneath
  doc.setTextColor(30, 41, 59);
  let textY = 14;
  if (logo) {
    const w = 62;
    doc.addImage(logo.data, 'PNG', M, 9, w, w * logo.ratio);
    textY = 9 + w * logo.ratio + 5;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(settings.company_name || 'Company', M, 15);
    textY = 21;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const addr = [logo ? settings.company_name : '', settings.company_address].filter(Boolean).join(' · ');
  if (addr) doc.text(doc.splitTextToSize(addr, W - 2 * M - 60), M, textY);
  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('SALARY SLIP', W - M, 14, { align: 'right' });
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(monthLabel(r.year, r.month), W - M, 20, { align: 'right' });
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.8);
  doc.line(M, 29, W - M, 29);
  doc.setLineWidth(0.2);

  const kv = { theme: 'grid' as const, styles: { fontSize: 9, cellPadding: 2.2, lineColor: [226, 232, 240] as [number, number, number] } };

  autoTable(doc, {
    ...kv,
    startY: 36,
    body: [
      ['Employee ID', employee.employee_code, 'Designation', employee.designation],
      ['Employee Name', employee.full_name, 'Date of Joining', formatDate(employee.date_of_joining)],
      ['Monthly Salary', moneyPlain(r.monthlySalary), 'Daily Salary', `${moneyPlain(r.dailyRate)} (/${r.daysInMonth} days)`],
      ['Days in Month', String(r.daysInMonth), 'Payable Days', fmtDays(r.payableDays)],
    ],
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 34 }, 2: { fontStyle: 'bold', fillColor: [248, 250, 252], cellWidth: 34 } },
  });

  const c = r.counts;
  autoTable(doc, {
    ...kv,
    startY: finalY(doc) + 5,
    head: [['Present', 'Half Days', 'Late Arrivals', 'Paid Leave', 'Unpaid Leave', 'Paid Holidays', 'Weekly Offs', 'Absent']],
    body: [[c.present, c.halfDays, `${c.lateArrivals}${c.lateExcused ? ` (${c.lateExcused} excused)` : ''}`, c.paidLeave, c.unpaidLeave, c.paidHolidays, c.weeklyOffsPaid + c.weeklyOffsUnpaid, c.absent].map(String)],
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontSize: 8 },
    bodyStyles: { halign: 'center' },
  });

  const earnings: [string, string][] = [[`Earned Salary (${fmtDays(r.payableDays)} payable days)`, moneyPlain(r.grossEarned)]];
  r.adjustments.filter((a) => a.adj_type === 'addition').forEach((a) => earnings.push([`Adjustment: ${a.reason}`, moneyPlain(a.amount)]));
  const deductions: [string, string][] = [];
  r.penalties.forEach((p) => {
    const cat = PENALTY_CATEGORIES.find((x) => x.value === p.category)?.label ?? 'Penalty';
    deductions.push([`Penalty (${cat}, ${formatDate(p.penalty_date)}): ${p.reason}`, moneyPlain(p.amount)]);
  });
  r.adjustments.filter((a) => a.adj_type === 'deduction').forEach((a) => deductions.push([`Deduction: ${a.reason}`, moneyPlain(a.amount)]));
  const rows = Math.max(earnings.length, deductions.length, 1);
  const body = Array.from({ length: rows }, (_, i) => [earnings[i]?.[0] ?? '', earnings[i]?.[1] ?? '', deductions[i]?.[0] ?? '', deductions[i]?.[1] ?? '']);
  body.push([
    'Total Earnings', moneyPlain(r.grossEarned + r.additionsTotal),
    'Total Deductions', moneyPlain(r.penaltiesTotal + r.deductionsTotal),
  ]);

  autoTable(doc, {
    ...kv,
    startY: finalY(doc) + 5,
    head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
    body,
    headStyles: { fillColor: BRAND, textColor: 255 },
    columnStyles: { 1: { halign: 'right', cellWidth: 30 }, 3: { halign: 'right', cellWidth: 30 } },
    didParseCell: (d) => {
      if (d.section === 'body' && d.row.index === body.length - 1) {
        d.cell.styles.fontStyle = 'bold';
        d.cell.styles.fillColor = [248, 250, 252];
      }
    },
  });

  let y = finalY(doc) + 8;
  doc.setFillColor(238, 244, 255);
  doc.roundedRect(M, y, W - 2 * M, 20, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('NET SALARY PAYABLE', M + 4, y + 8);
  doc.text(moneyPlain(r.netSalary), W - M - 4, y + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(amountInWords(r.netSalary), M + 4, y + 15);
  y += 28;

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const notes = [
    'Daily salary = Monthly salary / calendar days in the month. Payable days = full days + half days x 0.5 + paid leave + paid holidays/offs.',
    r.salaryChangedMidMonth ? 'Salary was revised during this month; each day is paid at the salary in force on that day.' : '',
    finalizedAt ? `Payroll finalised on ${formatDateTime(finalizedAt)}.` : `DRAFT – generated on ${formatDateTime(new Date().toISOString())}; figures may change until payroll is finalised.`,
    'This is a computer-generated salary slip and does not require a signature.',
  ].filter(Boolean);
  notes.forEach((n) => {
    const lines = doc.splitTextToSize(n, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 4;
  });
  doc.setTextColor(30, 41, 59);
}

export function salarySlipPDF(slips: SlipInput[], filename: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  slips.forEach((s, i) => {
    if (i > 0) doc.addPage();
    drawSlip(doc, s);
  });
  doc.save(filename);
}

export function tablePDF(opts: { title: string; subtitle?: string; head: string[]; body: (string | number)[][]; filename: string; landscape?: boolean }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: opts.landscape ? 'landscape' : 'portrait' });
  if (logo) doc.addImage(logo.data, 'PNG', doc.internal.pageSize.getWidth() - 14 - 40, 9, 40, 40 * logo.ratio);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(opts.title, 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(opts.subtitle ?? `Generated on ${formatDateTime(new Date().toISOString())} (IST)`, 14, 21);
  doc.setTextColor(30, 41, 59);
  autoTable(doc, {
    startY: 26,
    head: [opts.head],
    body: opts.body.map((r) => r.map(String)),
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: BRAND },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });
  doc.save(opts.filename);
}
