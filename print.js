// ماژول print — ساخت سند چاپی (قالب مشترک برای پیش‌نمایش، چاپ/PDF و تصویر)
import { formatInt, formatDec, lineLabel } from './format.js';
import { PAPERS, FONT_STACK } from './settings.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// فونت‌های B (نازنین، میترا، تیتر) فونت سیستم‌اند: اگر روی دستگاه نصب باشند با local() پیدا می‌شوند؛
// اگر فایل ttf همان‌نام کنار برنامه گذاشته شود، از آن هم استفاده می‌شود. وگرنه فونت بعدیِ زنجیره (Tahoma) می‌آید.
const FACES = [
  { fam: 'Vazirmatn', w: 400, file: 'Vazirmatn-Regular.woff2', fmt: 'woff2' },
  { fam: 'Vazirmatn', w: 500, file: 'Vazirmatn-Medium.woff2', fmt: 'woff2' },
  { fam: 'Vazirmatn', w: 700, file: 'Vazirmatn-Bold.woff2', fmt: 'woff2' },
  { fam: 'Sahel', w: 400, file: 'Sahel.woff2', fmt: 'woff2' },
  { fam: 'Sahel', w: 700, file: 'Sahel-Bold.woff2', fmt: 'woff2' },
  { fam: 'Samim', w: 400, file: 'Samim.woff2', fmt: 'woff2' },
  { fam: 'Samim', w: 700, file: 'Samim-Bold.woff2', fmt: 'woff2' },
  { fam: 'B Nazanin', w: 400, local: ['B Nazanin', 'BNazanin'], file: 'BNazanin.ttf', fmt: 'truetype' },
  { fam: 'B Nazanin', w: 700, local: ['B Nazanin Bold', 'BNazanin-Bold', 'BNazaninBold'], file: 'BNazanin-Bold.ttf', fmt: 'truetype' },
  { fam: 'B Mitra', w: 400, local: ['B Mitra', 'BMitra'], file: 'BMitra.ttf', fmt: 'truetype' },
  { fam: 'B Mitra', w: 700, local: ['B Mitra Bold', 'BMitra-Bold', 'BMitraBold'], file: 'BMitra-Bold.ttf', fmt: 'truetype' },
  { fam: 'B Titr', w: 400, local: ['B Titr', 'BTitr'], file: 'BTitr.ttf', fmt: 'truetype' },
  { fam: 'B Titr', w: 700, local: ['B Titr Bold', 'BTitr-Bold', 'BTitrBold'], file: 'BTitr-Bold.ttf', fmt: 'truetype' },
];
/** CSS فونت‌ها. fontData (اختیاری): Map(file → dataURI|null) برای حالت تصویر که منابع خارجی ندارد. */
export function fontFaceCss(families = null, fontData = null) {
  return FACES.filter(f => !families || families.includes(f.fam)).map(f => {
    const src = (f.local || []).map(n => `local("${n}")`);
    if (fontData) { const d = fontData.get(f.file); if (d) src.push(`url(${d}) format("${f.fmt}")`); }
    else src.push(`url(${f.file}) format("${f.fmt}")`);
    return src.length ? `@font-face{font-family:"${f.fam}";font-weight:${f.w};src:${src.join(',')}}` : '';
  }).join('\n');
}
export const fontFilesFor = families => FACES.filter(f => families.includes(f.fam)).map(f => f.file);

export function pageDims(cfg) {
  const [w, h] = PAPERS[cfg.paper] || PAPERS.A4;
  return cfg.orientation === 'landscape' ? { w: h, h: w } : { w, h };
}
export const MM = 96 / 25.4;

/** مدل چاپ از روی Snapshot پیش‌فاکتور */
export function modelFromInvoice(inv) {
  return { sellerName: inv.sellerName || '', line: inv.line, date: inv.date, buyerName: inv.buyerName, buyerCode: inv.buyerCode || '', rows: inv.rows, totals: inv.totals, currency: inv.currency };
}

export function pdfFileName(model) {
  const who = (model.buyerCode || model.buyerName || 'buyer').toString().trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return `proforma-${who}-${String(model.date || '').replace(/\//g, '')}`;
}

/**
 * حالت‌ها: چاپ (پیش‌فرض)، preview (نمایش روی صفحه)، image (برای ساخت PNG؛ بدون منبع خارجی).
 * نکته‌ی چاپ: @page margin:0 است تا مرورگر سرصفحه/پاصفحه‌ی خودش (تاریخ، نام فایل، آدرس) را نچاپد؛
 * حاشیه‌ی بالا/پایین هر صفحه با ردیف‌های فاصله‌ی تکرارشونده‌ی thead/tfoot ساخته می‌شود.
 */
export function buildDocument(model, cfg, { preview = false, image = false, fontData = null } = {}) {
  const f = k => cfg.fonts[k];
  const fam = FONT_STACK(cfg.fontFamily);
  const famTitle = FONT_STACK(cfg.titleFont || cfg.fontFamily);
  const lw = cfg.lineWidth, pad = cfg.cellPadding, h = cfg.heights, m = cfg.margins;
  const { w: pw, h: ph } = pageDims(cfg);
  const nfmt = { digits: cfg.digits, sep: cfg.thousandSep };
  const I = n => formatInt(n, nfmt), D = n => formatDec(n, nfmt);
  const cls = (k, extra = '') => `font-size:${f(k).size}pt;font-weight:${f(k).bold ? 700 : 400};${extra}`;
  const paperName = cfg.paper === 'Letter' ? 'letter' : cfg.paper;
  const boxJustify = { left: 'flex-end', center: 'center', right: 'flex-start' }[cfg.totalBoxPos] || 'flex-end'; // در RTL: flex-end = چپ
  const families = [...new Set([cfg.fontFamily, cfg.titleFont || cfg.fontFamily])];
  // فاصله‌ی بین بخش‌ها: ۰ = چسبیده (خطوط هم‌پوشانی دارند)، بیشتر از ۰ = فاصله‌ی خالی به میلی‌متر
  const g = k => { const v = Number(cfg.gaps?.[k]) || 0; return v > 0 ? `${v}mm` : `-${lw}px`; };
  const gapCss = `.seller{margin-top:${g('titleSeller')}}\n.buyer{margin-top:${g('sellerBuyer')}}\n.items{margin-top:${g('buyerItems')}}\n.boxwrap{margin-top:${g('itemsBox')}}\n`;

  const rows = model.rows;
  const keepFrom = Math.max(0, rows.length - 2);
  const body = rows.map((r, i) => `
    <tr class="item${i >= keepFrom ? ' keep' : ''}">
      <td style="${cls('bodyNum')}">${I(i + 1)}</td>
      <td class="desc" style="${cls('bodyText')}">${esc(r.code)}_${esc(r.name)}</td>
      <td style="${cls('bodyNum')}">${D(r.cartons)}</td>
      <td style="${cls('bodyNum')}">${I(r.cans)}</td>
      <td style="${cls('bodyNum')}">${I(r.fee)}</td>
      <td style="${cls('bodyNum')}">${I(r.gross)}</td>
      <td style="${cls('bodyNum')}">${I(r.discount)}</td>
      <td style="${cls('bodyNum')}">${I(r.tax)}</td>
      <td style="${cls('bodyNum')}">${I(r.final)}</td>
    </tr>`).join('');
  const t = model.totals;
  const withCode = cfg.showBuyerCode && String(model.buyerCode || '').trim();
  const buyerRow = withCode
    ? `<table class="buyer"><colgroup><col style="width:70%"><col style="width:30%"></colgroup><tr><td>نام خریدار: ${esc(model.buyerName)}</td><td>کد خریدار: <span dir="ltr" style="unicode-bidi:isolate">${esc(model.buyerCode)}</span></td></tr></table>`
    : `<table class="buyer"><tr><td>نام خریدار: ${esc(model.buyerName)}</td></tr></table>`;
  const colgroup = `<colgroup>${cfg.colWidths.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
  const heads = ['ردیف', 'شرح کالا', 'تعداد<br/>(کارتن)', 'تعداد<br/>(قوطی)', 'فی<br/>(ریال)', 'مبلغ', 'تخفیف', 'مالیات', 'جمع کل<br/>با مالیات'];

  const sheet = `<div class="sheet">
<table class="title"><tr><td>${esc(cfg.titleText || 'پیش فاکتور فروش کالا')}</td></tr></table>
<table class="seller"><colgroup><col style="width:52%"><col style="width:18%"><col style="width:30%"></colgroup>
<tr><td class="name">نام فروشنده: ${esc(model.sellerName)}</td><td>${esc(lineLabel(model.line))}</td><td>تاریخ پیش فاکتور: <span dir="ltr" style="unicode-bidi:isolate">${esc(model.date)}</span></td></tr></table>
${buyerRow}
<table class="items">${colgroup}
<thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead>
<tbody>${body}
<tr class="total"><td colspan="2">مجموع</td><td>${D(t.cartons)}</td><td>${I(t.cans)}</td><td></td><td>${I(t.gross)}</td><td>${I(t.discount)}</td><td>${I(t.tax)}</td><td>${I(t.final)}</td></tr>
</tbody></table>
<div class="boxwrap"><div class="box">جمع مبلغ: ${esc(model.currency || 'ریال')} ${I(t.final)}</div></div>
</div>`;

  const content = image
    ? sheet
    : `<table class="page"><thead><tr><td class="sp" style="height:${m.top}mm"></td></tr></thead><tfoot><tr><td class="sp" style="height:${m.bottom}mm"></td></tr></tfoot><tbody><tr><td class="pc">${sheet}</td></tr></tbody></table>`;

  const modeCss = image
    ? `#root{width:${pw}mm;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}`
    : `#root{padding:0 ${m.right}mm 0 ${m.left}mm}`
      + (preview ? `
    html{background:#8b95a1}
    body{width:${pw}mm;min-height:${ph}mm;margin:0 auto;background:#fff;
      background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${ph}mm - 1.5px),#ef4444 calc(${ph}mm - 1.5px),#ef4444 ${ph}mm)}` : '');

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${esc(pdfFileName(model))}</title>
<style>
${fontFaceCss(image ? families : null, fontData)}
@page{size:${paperName} ${cfg.orientation};margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${fam};color:#000;background:#fff;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
#root{font-family:${fam};color:#000;background:#fff;direction:rtl}
table{width:100%;border-collapse:collapse;table-layout:fixed}
table.page{table-layout:auto}
td.sp,td.pc{border:0;padding:0}
.sheet td,.sheet th{border:${lw}px solid #000;padding:${pad}mm ${pad + 0.5}mm;text-align:center;vertical-align:middle;line-height:1.5;overflow-wrap:anywhere}
.title td{height:${h.title}mm;font-family:${famTitle};${cls('title')}}
.seller td{height:${h.seller}mm;${cls('seller')}}
.buyer td{height:${h.buyer}mm;${cls('buyer')};text-align:right}
.seller td.name{text-align:right}
${gapCss}.items thead{display:table-header-group}
.items thead th{height:${h.thead}mm;${cls('thead')}}
.items tbody tr{break-inside:avoid;page-break-inside:avoid}
.items td{height:${h.row}mm}
.items td.desc{text-align:right}
.items tr.keep{break-after:avoid;page-break-after:avoid}
.items tr.total{break-before:avoid;page-break-before:avoid;break-inside:avoid}
.items tr.total td{height:${h.total}mm;${cls('total')}}
.boxwrap{display:flex;justify-content:${boxJustify};break-before:avoid;page-break-before:avoid;break-inside:avoid}
.box{border:${lw}px solid #000;min-width:38%;padding:${pad}mm 4mm;height:${h.box}mm;display:flex;align-items:center;justify-content:center;${cls('box')}}
${modeCss}
</style></head><body><div id="root">${content}</div></body></html>`;
}

/** چاپ مستقیم / ذخیره PDF از طریق iframe پنهان با همان قالب پیش‌نمایش */
export function printHTML(html, fileName) {
  return new Promise(resolve => {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    Object.assign(fr.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', visibility: 'hidden' });
    const prevTitle = document.title;
    fr.onload = async () => {
      try { await fr.contentWindow.document.fonts.ready; } catch { /* ادامه */ }
      document.title = fileName;
      fr.contentWindow.focus();
      const cleanup = () => { document.title = prevTitle; setTimeout(() => fr.remove(), 500); resolve(); };
      fr.contentWindow.addEventListener('afterprint', cleanup, { once: true });
      fr.contentWindow.print();
      setTimeout(() => { if (fr.isConnected && document.title === fileName) cleanup(); }, 60000);
    };
    fr.srcdoc = html;
    document.body.appendChild(fr);
  });
}

async function fileToDataUri(file) {
  try {
    const r = await fetch(file); if (!r.ok) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    const mime = file.endsWith('.ttf') ? 'font/ttf' : 'font/woff2';
    return `data:${mime};base64,${btoa(bin)}`;
  } catch { return null; }
}

/** ساخت تصویر PNG از همان سند چاپی (SVG foreignObject → canvas). فونت‌ها داخل تصویر جاسازی می‌شوند. */
export async function renderPng(model, cfg, scale = 2) {
  const families = [...new Set([cfg.fontFamily, cfg.titleFont || cfg.fontFamily])];
  const fontData = new Map();
  await Promise.all(fontFilesFor(families).map(async f => fontData.set(f, await fileToDataUri(f))));
  const html = buildDocument(model, cfg, { image: true, fontData });
  const { w } = pageDims(cfg);
  const W = Math.ceil(w * MM);
  const fr = document.createElement('iframe');
  Object.assign(fr.style, { position: 'fixed', left: '-99999px', top: '0', width: W + 'px', height: '800px', border: '0' });
  const loaded = new Promise(res => { fr.onload = res; });
  fr.srcdoc = html; document.body.appendChild(fr);
  try {
    await loaded;
    const doc = fr.contentDocument;
    await doc.fonts.ready;
    const root = doc.getElementById('root');
    const H = Math.ceil(root.getBoundingClientRect().height);
    const ser = new XMLSerializer();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${ser.serializeToString(doc.querySelector('style'))}${ser.serializeToString(root)}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, W, H);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('ساخت تصویر ناموفق بود.')), 'image/png'));
  } finally { fr.remove(); }
}
