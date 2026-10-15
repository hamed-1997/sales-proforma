// ماژول print — ساخت سند چاپی (قالب مشترک برای پیش‌نمایش و چاپ/PDF)
import { formatInt, formatDec, toFaDigits } from './format.js';
import { PAPERS, FONT_STACK } from './settings.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FONT_FACES = `
@font-face{font-family:Vazirmatn;font-weight:400;src:url(./Vazirmatn-Regular.woff2) format("woff2")}
@font-face{font-family:Vazirmatn;font-weight:500;src:url(./Vazirmatn-Medium.woff2) format("woff2")}
@font-face{font-family:Vazirmatn;font-weight:700;src:url(./Vazirmatn-Bold.woff2) format("woff2")}
@font-face{font-family:Sahel;font-weight:400;src:url(./Sahel.woff2) format("woff2")}
@font-face{font-family:Sahel;font-weight:700;src:url(./Sahel-Bold.woff2) format("woff2")}
@font-face{font-family:Samim;font-weight:400;src:url(./Samim.woff2) format("woff2")}
@font-face{font-family:Samim;font-weight:700;src:url(./Samim-Bold.woff2) format("woff2")}`;

export function pageDims(cfg) {
  const [w, h] = PAPERS[cfg.paper] || PAPERS.A4;
  return cfg.orientation === 'landscape' ? { w: h, h: w } : { w, h };
}

/** مدل چاپ از روی Snapshot پیش‌فاکتور */
export function modelFromInvoice(inv) {
  return {
    sellerName: inv.sellerName || '', line: inv.line, date: inv.date,
    buyerName: inv.buyerName, buyerCode: inv.buyerCode || '',
    rows: inv.rows, totals: inv.totals,
  };
}

export function pdfFileName(model) {
  const who = (model.buyerCode || model.buyerName || 'buyer').toString().trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return `proforma-${who}-${String(model.date || '').replace(/\//g, '')}`;
}

export function buildDocument(model, cfg, { preview = false } = {}) {
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
  const buyer = esc(model.buyerName) + (cfg.showBuyerCode && model.buyerCode ? ` &nbsp;(کد: ${esc(model.buyerCode)})` : '');
  const colgroup = `<colgroup>${cfg.colWidths.map(w => `<col style="width:${w}%">`).join('')}</colgroup>`;
  const heads = ['ردیف', 'شرح کالا', 'تعداد<br>(کارتن)', 'تعداد<br>(قوطی)', 'فی<br>(ریال)', 'مبلغ', 'تخفیف', 'مالیات', 'جمع کل<br>با مالیات'];

  const previewCss = preview ? `
    html{background:#8b95a1;min-height:100%}
    body{width:${pw}mm;min-height:${ph}mm;margin:0 auto;background:#fff;padding:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
      background-image:repeating-linear-gradient(to bottom,transparent 0,transparent calc(${ph}mm - 1.5px),#ef4444 calc(${ph}mm - 1.5px),#ef4444 ${ph}mm)}`
    : '';

  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<title>${esc(pdfFileName(model))}</title>
<style>
${FONT_FACES}
@page{size:${paperName} ${cfg.orientation};margin:${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${fam};color:#000;background:#fff;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td,th{border:${lw}px solid #000;padding:${pad}mm ${pad + 0.5}mm;text-align:center;vertical-align:middle;line-height:1.5;overflow-wrap:anywhere}
.title td{height:${h.title}mm;font-family:${famTitle};${cls('title')}}
.seller td{height:${h.seller}mm;${cls('seller')}}
.buyer td{height:${h.buyer}mm;${cls('buyer')};text-align:right}
.seller td.name{text-align:right}
.items{border-top:none}
.sheet > table + table{margin-top:-${lw}px}
.items thead{display:table-header-group}
.items thead th{height:${h.thead}mm;${cls('thead')}}
.items tbody tr{break-inside:avoid;page-break-inside:avoid}
.items td{height:${h.row}mm}
.items td.desc{text-align:right}
.items tr.keep{break-after:avoid;page-break-after:avoid}
.items tr.total{break-before:avoid;page-break-before:avoid;break-inside:avoid}
.items tr.total td{height:${h.total}mm;${cls('total')}}
.boxwrap{display:flex;justify-content:${boxJustify};break-before:avoid;page-break-before:avoid;break-inside:avoid;margin-top:-${lw}px}
.box{border:${lw}px solid #000;min-width:38%;padding:${pad}mm 4mm;height:${h.box}mm;display:flex;align-items:center;justify-content:center;${cls('box')}}
${previewCss}
</style></head><body><div class="sheet">
<table class="title"><tr><td>پیش فاکتور فروش کالا</td></tr></table>
<table class="seller"><colgroup><col style="width:52%"><col style="width:18%"><col style="width:30%"></colgroup>
<tr><td class="name">نام فروشنده: ${esc(model.sellerName)}</td><td>لاین فروش: ${esc(toFaDigits(model.line))}</td><td>تاریخ پیش فاکتور: <span dir="ltr" style="unicode-bidi:isolate">${esc(model.date)}</span></td></tr></table>
<table class="buyer"><tr><td>نام خریدار: ${buyer}</td></tr></table>
<table class="items">${colgroup}
<thead><tr>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead>
<tbody>${body}
<tr class="total"><td colspan="2">مجموع</td><td>${D(t.cartons)}</td><td>${I(t.cans)}</td><td></td><td>${I(t.gross)}</td><td>${I(t.discount)}</td><td>${I(t.tax)}</td><td>${I(t.final)}</td></tr>
</tbody></table>
<div class="boxwrap"><div class="box">جمع مبلغ: ${esc(model.currency || 'ریال')} ${I(t.final)}</div></div>
</div></body></html>`;
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
