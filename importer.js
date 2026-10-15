// ماژول importer — ورود/خروج Excel و CSV برای بانک کالا (SheetJS محلی: vendor/xlsx.full.min.js)
import { cleanNumberText, toEnDigits } from './format.js';

/** تبدیل کد کالا به متن یکدست (ارقام لاتین، بدون فاصله‌ی دو سر) */
export const normCode = v => toEnDigits(String(v ?? '')).replace(/[\u200c\u200f\u200e]/g, '').trim();

/**
 * منطق خالص اعتبارسنجی (بدون وابستگی به SheetJS تا قابل تست باشد).
 * rows2d: آرایه‌ی ردیف‌ها؛ هر ردیف [کد, شرح, تعداد در کارتن] ؛ existing: Set کدهای موجود
 */
export function validateRows(rows2d, existing = new Set()) {
  const errors = [], warnings = [], byCode = new Map();
  let start = 0;
  // ردیف عنوان اختیاری: اولین ردیف غیرخالی که ستون سوم آن عدد نیست
  const firstIdx = rows2d.findIndex(r => r.some(c => String(c ?? '').trim() !== ''));
  if (firstIdx >= 0) {
    const c3 = cleanNumberText(rows2d[firstIdx][2]);
    if (!/^\d+(\.\d+)?$/.test(c3)) start = firstIdx + 1; else start = firstIdx;
  }
  for (let i = start; i < rows2d.length; i++) {
    const r = rows2d[i], line = i + 1;
    if (r.every(c => String(c ?? '').trim() === '')) continue;
    const code = normCode(r[0]), name = String(r[1] ?? '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim(); // یکسان‌سازی ی/ک عربی
    const t = cleanNumberText(r[2]);
    const reasons = [];
    if (!code) reasons.push('کد کالا خالی است');
    if (!name) reasons.push('شرح کالا خالی است');
    if (!/^\d+$/.test(t)) reasons.push(t === '' ? 'تعداد در کارتن خالی است' : 'تعداد در کارتن باید عدد صحیح باشد (نه اعشار یا متن)');
    else if (Number(t) <= 0) reasons.push('تعداد در کارتن باید بزرگ‌تر از صفر باشد');
    if (reasons.length) { errors.push({ line, reason: reasons.join('؛ ') }); continue; }
    if (byCode.has(code)) warnings.push(`کد «${code}» در فایل تکراری است؛ ردیف ${line} جایگزین ردیف ${byCode.get(code).line} شد.`);
    byCode.set(code, { code, name, perCarton: Number(t), line });
  }
  const valid = [...byCode.values()];
  const updates = valid.filter(p => existing.has(p.code)).length;
  return { valid, errors, warnings, newCount: valid.length - updates, updateCount: updates };
}

async function decodeText(buf) {
  const u8 = new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch { return new TextDecoder('windows-1256').decode(u8); }
}

export async function readFileRows(file) {
  if (!window.XLSX) throw new Error('کتابخانه‌ی خواندن Excel بارگذاری نشده است.');
  const buf = await file.arrayBuffer();
  let wb;
  if (/\.csv$/i.test(file.name)) {
    wb = XLSX.read(await decodeText(buf), { type: 'string', raw: true });
  } else {
    wb = XLSX.read(buf, { type: 'array', cellText: true, cellDates: false });
  }
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('فایل شیت ندارد.');
  // raw:false => متن نمایش‌داده‌شده (صفرهای ابتدای کد و ارقام فارسی حفظ می‌شوند)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
}

function saveWb(rows, filename) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 48 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'بانک کالا');
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(wb, filename);
}
export function downloadSample() {
  saveWb([['کد کالا', 'شرح کالا', 'تعداد در کارتن'], ['5199', 'نمونه شرح کالا ۱', 24], ['05200', 'نمونه شرح کالا ۲', 12]], 'products-sample.xlsx');
}
export function exportProducts(products) {
  const rows = [['کد کالا', 'شرح کالا', 'تعداد در کارتن'], ...products.map(p => [p.code, p.name, p.perCarton])];
  saveWb(rows, 'products-bank.xlsx');
}
