// ماژول settings — تنظیمات عمومی و الگوهای چاپ (با مقادیر پیش‌فرض)
import { repo, uid } from './db.js';

export const FONTS = [
  { id: 'Vazirmatn', label: 'وزیرمتن (Vazirmatn)' },
  { id: 'Sahel', label: 'ساحل (Sahel)' },
  { id: 'Samim', label: 'صمیم (Samim)' },
  { id: 'B Nazanin', label: 'بی‌نازنین (B Nazanin)', system: true },
  { id: 'B Mitra', label: 'بی‌میترا (B Mitra)', system: true },
  { id: 'B Titr', label: 'بی‌تیتر (B Titr)', system: true },
  { id: 'Tahoma', label: 'Tahoma (فونت سیستم)' },
  { id: 'Arial', label: 'Arial (فونت سیستم)' },
];
export const FONT_STACK = id => `"${id}", Tahoma, Arial, sans-serif`;

export const COLS = ['ردیف', 'شرح کالا', 'تعداد (کارتن)', 'تعداد (قوطی)', 'فی (ریال)', 'مبلغ', 'تخفیف', 'مالیات', 'جمع کل با مالیات'];
export const MIN_COL = 5;
export const PAPERS = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] };

export const FONT_SECTIONS = [
  ['title', 'عنوان «پیش فاکتور فروش کالا»'],
  ['seller', 'ردیف فروشنده / لاین / تاریخ'],
  ['buyer', 'ردیف خریدار'],
  ['thead', 'سربرگ ستون‌های جدول'],
  ['bodyText', 'بدنه‌ی جدول (شرح کالا)'],
  ['bodyNum', 'بدنه‌ی جدول (اعداد)'],
  ['total', 'ردیف «مجموع»'],
  ['box', 'کادر «جمع مبلغ» انتهایی'],
];
export const HEIGHT_SECTIONS = [
  ['title', 'کادر عنوان'], ['seller', 'ردیف فروشنده'], ['buyer', 'ردیف خریدار'],
  ['thead', 'سربرگ جدول'], ['row', 'ردیف‌های کالا'], ['total', 'ردیف مجموع'], ['box', 'کادر انتهایی'],
];

export const DEFAULT_PRINT = Object.freeze({
  fontFamily: 'Vazirmatn', titleFont: '',
  fonts: {
    title: { size: 18, bold: true }, seller: { size: 11, bold: true }, buyer: { size: 11, bold: true },
    thead: { size: 9, bold: true }, bodyText: { size: 9, bold: false }, bodyNum: { size: 9, bold: false },
    total: { size: 10, bold: true }, box: { size: 13, bold: true },
  },
  colWidths: [6, 26, 8, 8, 11, 12, 9, 9, 11],
  heights: { title: 12, seller: 9, buyer: 9, thead: 11, row: 7, total: 9, box: 12 },
  cellPadding: 1.5,
  orientation: 'landscape', paper: 'A4', margins: { top: 10, right: 10, bottom: 10, left: 10 },
  lineWidth: 1, totalBoxPos: 'left', showBuyerCode: true, thousandSep: ',', digits: 'fa',
});

export const DEFAULT_GENERAL = Object.freeze({
  companyName: '', currency: 'ریال', taxMaxPct: 100, rounding: 'half-up', startNumber: 1,
  allowDecimalFee: false, theme: 'light', defaultDiscountPct: '0', defaultTaxPct: '10',
});

export const clone = o => JSON.parse(JSON.stringify(o));
/** ادغام عمیق مقادیر ذخیره‌شده روی پیش‌فرض (برای سازگاری با نسخه‌های بعد) */
export function merge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    if (base && typeof base[k] === 'object' && !Array.isArray(base[k]) && base[k] !== null) out[k] = merge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

export const state = { general: clone(DEFAULT_GENERAL), templates: [], activeTemplateId: null };

export async function load() {
  state.general = merge(DEFAULT_GENERAL, await repo.getSetting('general', {}));
  let tpls = await repo.getAll('templates');
  if (!tpls.length) {
    const t = { id: uid(), name: 'الگوی پیش‌فرض', config: clone(DEFAULT_PRINT) };
    await repo.put('templates', t); tpls = [t];
  }
  state.templates = tpls.map(t => ({ ...t, config: merge(DEFAULT_PRINT, t.config) }));
  let active = await repo.getSetting('activeTemplate', null);
  if (!state.templates.some(t => t.id === active)) active = state.templates[0].id;
  state.activeTemplateId = active;
  // مهاجرت یک‌باره: کد خریدار در چاپ به‌طور پیش‌فرض نمایش داده شود (الگوهای قبلی با false ذخیره شده بودند)
  const mig = await repo.getSetting('migrations', {});
  if (!mig.buyerCodeOn) {
    for (const t of state.templates) { t.config.showBuyerCode = true; await repo.put('templates', t); }
    await repo.setSetting('migrations', { ...mig, buyerCodeOn: true });
  }
  applyTheme();
}
export const activeTemplate = () => state.templates.find(t => t.id === state.activeTemplateId) || state.templates[0];
export async function saveGeneral() { await repo.setSetting('general', state.general); applyTheme(); }
export async function saveTemplate(t) { await repo.put('templates', t); }
export async function setActive(id) { state.activeTemplateId = id; await repo.setSetting('activeTemplate', id); }
export async function addTemplate(name, config) {
  const t = { id: uid(), name, config: clone(config) };
  await repo.put('templates', t); state.templates.push(t); return t;
}
export async function removeTemplate(id) {
  if (state.templates.length < 2) return false;
  await repo.del('templates', id);
  state.templates = state.templates.filter(t => t.id !== id);
  if (state.activeTemplateId === id) await setActive(state.templates[0].id);
  return true;
}
export function applyTheme() { document.documentElement.dataset.theme = state.general.theme === 'dark' ? 'dark' : 'light'; }

/** نرمال‌سازی عرض ستون‌ها: مجموع ۱۰۰٪ و هیچ ستون کمتر از حداقل */
export function normalizeWidths(w) {
  let a = w.map(v => Math.max(MIN_COL, Number(v) || MIN_COL));
  for (let it = 0; it < 20; it++) {
    const sum = a.reduce((x, y) => x + y, 0);
    const k = 100 / sum;
    a = a.map(v => Math.max(MIN_COL, v * k));
    if (Math.abs(a.reduce((x, y) => x + y, 0) - 100) < 0.05) break;
  }
  a = a.map(v => Math.round(v * 10) / 10);
  const diff = Math.round((100 - a.reduce((x, y) => x + y, 0)) * 10) / 10;
  let imax = 0; a.forEach((v, i) => { if (v > a[imax]) imax = i; });
  a[imax] = Math.round((a[imax] + diff) * 10) / 10;
  return a;
}

/** آیا فونت سیستمی روی این دستگاه (یا به‌صورت فایل کنار برنامه) در دسترس است؟ */
export async function fontAvailable(family) {
  try { await Promise.race([document.fonts.load(`40px "${family}"`, 'مایع'), new Promise(r => setTimeout(r, 800))]); } catch { /* ادامه */ }
  const c = document.createElement('canvas').getContext('2d');
  const txt = 'مایع دست شوینده abcdefghij 0123456789';
  const w = f => { c.font = `40px ${f}`; return c.measureText(txt).width; };
  return w(`"${family}", monospace`) !== w('monospace') || w(`"${family}", serif`) !== w('serif');
}
