// توابع مشترک صفحات: کش بانک کالا، پیش‌نمایش چاپ
import { repo } from './db.js';
import { normCode } from './importer.js';
import { normSearch, formatInt } from './format.js';
import { buildDocument, pageDims, printHTML, pdfFileName, renderPng } from './print.js';
import * as S from './settings.js';
import { h, modal, btn, menuButton, toast, download } from './ui.js';

export let products = [];
let byCode = new Map();
export const codeKey = c => normCode(c).toLowerCase();

export async function refreshProducts() {
  products = (await repo.getAll('products')).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  byCode = new Map(products.map(p => [codeKey(p.code), p]));
  return products;
}
export const findProduct = code => (String(code ?? '').trim() ? byCode.get(codeKey(code)) || null : null);

/** جستجو بر اساس کد یا هر بخشی از نام؛ همه‌ی کلمه‌ها باید (به هر ترتیب) در کد یا نام باشند. */
export function searchProducts(q, limit = 40) {
  const full = normSearch(q).replace(/\s+/g, ' ');
  const tokens = full.split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  for (const p of products) {
    const c = normSearch(p.code), d = normSearch(p.name), hay = c + ' ' + d;
    if (!tokens.every(t => hay.includes(t))) continue;
    const score = c === full ? 0 : c.startsWith(tokens[0]) ? 1 : d.startsWith(full) ? 2 : d.includes(full) ? 3 : 4;
    scored.push([score, p]);
  }
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, limit).map(x => x[1]);
}

export const pxPerMm = 96 / 25.4;

/**
 * پیش‌نمایش A4 داخل یک ظرف؛ همان قالب چاپ را در iframe نشان می‌دهد و به عرض ظرف مقیاس می‌دهد.
 * ضدلرزش: scrollbar-gutter ثابت (در CSS)، فقط به تغییر «عرض» ظرف واکنش می‌دهد و تغییرهای ناچیز مقیاس را نادیده می‌گیرد.
 */
export function mountPreview(container) {
  const frame = h('iframe', { class: 'pv-frame', title: 'پیش‌نمایش چاپ', sandbox: 'allow-same-origin' });
  const holder = h('div', { class: 'pv-holder' }, frame);
  holder.style.visibility = 'hidden';
  container.replaceChildren(holder);
  let cfg = null, naturalH = 0, lastK = 0, lastW = -1, raf = 0, ready = false;
  const apply = () => {
    raf = 0;
    if (!cfg || !ready) return;
    const { w, h: ph } = pageDims(cfg);
    const pxW = w * pxPerMm;
    let k = Math.max(0.2, (container.clientWidth - 16) / pxW);
    if (lastK && Math.abs(k - lastK) < 0.004) k = lastK;
    lastK = k;
    const H = Math.max(naturalH, ph * pxPerMm);
    frame.style.width = pxW + 'px'; frame.style.height = H + 'px'; frame.style.transform = `scale(${k})`;
    holder.style.width = pxW * k + 'px'; holder.style.height = H * k + 'px';
    holder.style.visibility = 'visible';
  };
  const fit = () => { if (!raf) raf = requestAnimationFrame(apply); };
  const ro = new ResizeObserver(() => { const w = container.clientWidth; if (w === lastW) return; lastW = w; fit(); });
  ro.observe(container);
  frame.addEventListener('load', () => {
    if (!cfg) return; // load اولیه‌ی about:blank
    const d = frame.contentDocument;
    const measure = () => { const hh = Math.ceil(d.documentElement.scrollHeight); if (Math.abs(hh - naturalH) > 1) naturalH = hh; ready = true; fit(); };
    measure();
    d.fonts?.ready.then(measure);
  });
  return {
    update(html, newCfg) { cfg = newCfg; frame.srcdoc = html; },
    destroy() { ro.disconnect(); cancelAnimationFrame(raf); },
  };
}

/** خروجی‌ها: تصویر PNG، PDF (از موتور چاپ مرورگر) و چاپ */
export async function doExport(kind, model) {
  const cfg = S.activeTemplate().config, name = pdfFileName(model);
  const m = { ...model, currency: model.currency || S.state.general.currency };
  try {
    if (kind === 'png') {
      toast('در حال ساخت تصویر…');
      download(name + '.png', await renderPng(m, cfg));
    } else {
      if (kind === 'pdf') toast('در پنجره‌ی چاپ، مقصد (Destination) را روی «Save as PDF» بگذارید.');
      await printHTML(buildDocument(m, cfg), name);
    }
  } catch (e) { toast('خروجی ناموفق بود: ' + (e.message || e), 'err'); }
}
export const exportItems = getModel => [
  { label: 'دانلود تصویر (PNG)', ic: 'download', onClick: () => { const m = getModel(); if (m) doExport('png', m); } },
  { label: 'ذخیره به‌صورت PDF', ic: 'download', onClick: () => { const m = getModel(); if (m) doExport('pdf', m); } },
  { label: 'چاپ', ic: 'print', onClick: () => { const m = getModel(); if (m) doExport('print', m); } },
];

/** پنجره‌ی پیش‌نمایش چاپ با منوی خروجی */
export function showPreviewModal(model, { extraActions = [] } = {}) {
  const cfg = S.activeTemplate().config;
  const box = h('div', { class: 'pv-box' });
  const pv = mountPreview(box);
  const m = modal({ title: 'پیش‌نمایش چاپ', wide: true, body: box, actions: [menuButton('خروجی', exportItems(() => model), { ic: 'download', up: true, cls: 'primary' }), ...extraActions, btn('بستن', { onClick: () => m.close() })], onClose: () => pv.destroy() });
  m.box.querySelector('.modal-body').style.overflow = 'hidden';
  requestAnimationFrame(() => pv.update(buildDocument(model, cfg, { preview: true }), cfg));
  return m;
}

export function summarizeInvoiceLabel(inv) { return `#${formatInt(inv.number)} — ${inv.buyerName}`; }
