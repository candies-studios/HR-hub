type Cell = string | number | boolean | null | undefined;

const esc = (v: Cell) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(headers: string[], rows: Cell[][]) {
  return [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CSV with UTF-8 BOM so Excel shows ₹ and Indian names correctly */
export function downloadCSV(filename: string, headers: string[], rows: Cell[][]) {
  downloadBlob(new Blob(['﻿' + toCSV(headers, rows)], { type: 'text/csv;charset=utf-8' }), filename);
}
