// توابع مشترک صفحات: کش بانک کالا، پیش‌نمایش چاپ
import { repo } from './db.js';
import { normCode } from './importer.js';
import { normSearch, formatInt } from './format.js';
import { buildDocument, pageDims, printHTML, pdfFileName } from './print.js';
import * as S from './settings.js';
import { h, modal, btn } from './ui.js';

export let products = [];
let byCode = new Map();
export const codeKey = c => normCode(c).toLowerCase();

export async function refreshProducts() {
  products = (await repo.getAll('products')).sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
  byCode = new Map(products.map(p => [codeKey(p.code), p]));
  return products;
}
export const findProduct = code => (String(code ?? '').trim() ? byCode.get(codeKey(code)) || null : null);

export function searchProducts(q, limit = 8) {
  const n = normSearch(q);
  if (!n) return [];
  const starts = [], contains = [];
  for (const p of products) {
    const c = normSearch(p.code), d = normSearch(p.name);
    if (c.startsWith(n)) starts.push(p);
    else if (c.includes(n) || d.includes(n)) contains.push(p);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export const pxPerMm = 96 / 25.4;

/** پیش‌نمایش A4 داخل یک ظرف؛ همان قالب چاپ را در iframe نشان می‌دهد و به عرض ظرف مقیاس می‌دهد */
export function mountPreview(container) {
  const frame = h('iframe', { class: 'pv-frame', title: 'پیش‌نمایش چاپ', sandbox: 'allow-same-origin' });
  const holder = h('div', { class: 'pv-holder' }, frame);
  container.replaceChildren(holder);
  let cfg = null, naturalH = 0;
  const fit = () => {
    if (!cfg) return;
    const { w } = pageDims(cfg);
    const pxW = w * pxPerMm;
    const k = Math.max(0.2, (container.clientWidth - 2) / pxW);
    frame.style.width = pxW + 'px';
    frame.style.height = Math.max(naturalH, 10) + 'px';
    frame.style.transform = `scale(${k})`;
    holder.style.width = pxW * k + 'px';
    holder.style.height = Math.max(naturalH, 10) * k + 'px';
  };
  const ro = new ResizeObserver(fit); ro.observe(container);
  frame.addEventListener('load', () => {
    if (!cfg) return; // load اولیه‌ی about:blank
    const d = frame.contentDocument;
    const measure = () => { naturalH = Math.max(d.documentElement.scrollHeight, pageDims(cfg).h * pxPerMm); fit(); };
    measure();
    d.fonts?.ready.then(measure);
  });
  return {
    update(html, newCfg) { cfg = newCfg; fit(); frame.srcdoc = html; },
    destroy() { ro.disconnect(); },
  };
}

/** پنجره‌ی پیش‌نمایش چاپ با دکمه‌ی چاپ/PDF */
export function showPreviewModal(model, { extraActions = [] } = {}) {
  const cfg = S.activeTemplate().config;
  const box = h('div', { class: 'pv-box' });
  const pv = mountPreview(box);
  const doc = html => html;
  const printBtn = btn('چاپ / PDF', { cls: 'primary', ic: 'print', onClick: () => printHTML(buildDocument(model, cfg), pdfFileName(model)) });
  const m = modal({ title: 'پیش‌نمایش چاپ', wide: true, body: box, actions: [printBtn, ...extraActions, btn('بستن', { onClick: () => m.close() })], onClose: () => pv.destroy() });
  requestAnimationFrame(() => pv.update(doc(buildDocument(model, cfg, { preview: true })), cfg));
  return m;
}

export function summarizeInvoiceLabel(inv) { return `#${formatInt(inv.number)} — ${inv.buyerName}`; }
