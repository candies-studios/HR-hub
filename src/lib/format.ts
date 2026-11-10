const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const num2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n: number | null | undefined) => inr.format(Number(n ?? 0));
export const moneyShort = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  return inr0.format(v);
};
/** For PDFs (jsPDF core fonts have no ₹ glyph) */
export const moneyPlain = (n: number | null | undefined) => `Rs. ${num2.format(Number(n ?? 0))}`;
export const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number) {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
}
function threeDigits(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ones[h]} Hundred` : '', r ? twoDigits(r) : ''].filter(Boolean).join(' ');
}

/** Indian numbering system: 1,23,45,678.50 -> "One Crore Twenty Three Lakh ... Rupees and Fifty Paise Only" */
export function amountInWords(amount: number): string {
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount * 100) / 100);
  let rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';
  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1000); rupees %= 1000;
  if (crore) parts.push(`${crore >= 100 ? threeDigits(crore) : twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));
  let out = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) out += `${out ? ' and ' : ''}${twoDigits(paise)} Paise`;
  return `${negative ? 'Minus ' : ''}${out} Only`;
}

/** URL of a file in /public that also works when hosted in a sub-folder (GitHub Pages). */
export const asset = (file: string) => `${import.meta.env.BASE_URL}${file}`;

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
