// ماژول format — قالب‌بندی و تجزیه‌ی اعداد (ارقام فارسی/عربی/لاتین)
const FA = '۰۱۲۳۴۵۶۷۸۹';
const AR = '٠١٢٣٤٥٦٧٨٩';

export function toEnDigits(s) {
  return String(s ?? '').replace(/[۰-۹]/g, d => FA.indexOf(d)).replace(/[٠-٩]/g, d => AR.indexOf(d));
}
export function toFaDigits(s) {
  return String(s ?? '').replace(/[0-9]/g, d => FA[d]);
}

/** حذف جداکننده‌ها و تبدیل به رشته‌ی لاتین تمیز؛ هرگز عدد غلط نمی‌سازد. */
export function cleanNumberText(raw) {
  return toEnDigits(raw)
    .replace(/[,٬،\s\u200c\u200f\u200e]/g, '')
    .replace(/[٫/]/g, '.')
    .trim();
}

/** عدد صحیح نامنفی. خروجی: {ok, value, empty, error} */
export function parseUInt(raw) {
  const t = cleanNumberText(raw);
  if (t === '') return { ok: false, empty: true, error: 'این فیلد الزامی است.' };
  if (!/^\d+$/.test(t)) return { ok: false, error: 'فقط عدد صحیح (بدون اعشار و علامت) مجاز است.' };
  const v = Number(t);
  if (!Number.isSafeInteger(v)) return { ok: false, error: 'عدد بیش از حد بزرگ است.' };
  return { ok: true, value: v };
}

/** عدد نامنفی با حداکثر ۲ رقم اعشار. */
export function parseDecimal2(raw) {
  const t = cleanNumberText(raw);
  if (t === '') return { ok: false, empty: true, error: 'این فیلد الزامی است.' };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, error: 'عدد نامعتبر است (حداکثر ۲ رقم اعشار).' };
  const v = Number(t);
  if (!Number.isFinite(v) || v > Number.MAX_SAFE_INTEGER / 100) return { ok: false, error: 'عدد بیش از حد بزرگ است.' };
  return { ok: true, value: v };
}

/** قالب‌بندی عدد صحیح با جداکننده‌ی هزارگان. */
export function formatInt(n, { digits = 'fa', sep = ',' } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const neg = n < 0;
  let s = BigInt(Math.abs(Math.round(n))).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  if (neg) s = '-' + s;
  return digits === 'fa' ? toFaDigits(s) : s;
}

/** عدد با حداکثر ۲ رقم اعشار (برای تعداد کارتن). */
export function formatDec(n, { digits = 'fa', sep = ',' } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const fixed = (Math.round(n * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  const [ip, fp] = fixed.split('.');
  let s = formatInt(Number(ip), { digits: 'en', sep });
  if (fp) s += (digits === 'fa' ? '٫' : '.') + fp;
  return digits === 'fa' ? toFaDigits(s) : s;
}

export function formatPct(bp, digits = 'fa') {
  const s = (bp / 100).toFixed(2).replace(/\.?0+$/, '');
  return digits === 'fa' ? toFaDigits(s.replace('.', '٫')) : s;
}

/** برای جستجو: ارقام لاتین، حروف کوچک، یکسان‌سازی ی/ک عربی. */
export function normSearch(s) {
  return toEnDigits(s).toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\u200c/g, ' ').trim();
}
