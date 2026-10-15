import { repo } from './db.js';
import { evaluateRow, sumTotals, parsePercentBP, cartonsX100 } from './calc.js';
import { formatInt, formatDec, cleanNumberText, toFaDigits } from './format.js';
import * as J from './jalali.js';
import * as S from './settings.js';
import { buildDocument, printHTML, pdfFileName } from './print.js';
import { h, btn, icon, field, toast, confirmBox, attachDatePicker } from './ui.js';
import { findProduct, searchProducts, refreshProducts, showPreviewModal } from './page-common.js';

let keySeq = 0;
const newRow = () => ({ key: ++keySeq, code: '', product: null, cans: '', fee: '', discountPct: '', taxPct: '', touched: false });

export async function render(view, ctx) {
  await refreshProducts();
  const G = S.state.general;
  const taxMaxBP = Math.round(Number(G.taxMaxPct) * 100);
  const opts = { taxMaxBP, allowDecimalFee: !!G.allowDecimalFee };
  let draft, dirty = false, submitted = false, notFound = false;

  const blank = () => ({ id: null, number: null, sellerName: '', date: J.today(), line: '1', buyerName: '', buyerCode: '', discountPct: G.defaultDiscountPct, taxPct: G.defaultTaxPct, rows: [newRow()] });
  const fromInvoice = (inv, copy) => ({
    id: copy ? null : inv.id, number: copy ? null : inv.number, sellerName: copy ? '' : inv.sellerName || '',
    date: copy ? J.today() : inv.date, line: inv.line, buyerName: inv.buyerName, buyerCode: inv.buyerCode || '',
    discountPct: inv.discountPct, taxPct: inv.taxPct,
    rows: inv.rows.map(r => ({ key: ++keySeq, code: r.code, product: { code: r.code, name: r.name, perCarton: r.perCarton }, cans: String(r.cans), fee: String(r.fee), discountPct: r.discountPct ?? '', taxPct: r.taxPct ?? '', touched: false })),
  });

  if (ctx.param) {
    const inv = await repo.get('invoices', ctx.param);
    if (!inv) { toast('پیش‌فاکتور پیدا نشد.', 'err'); notFound = true; } else draft = fromInvoice(inv, false);
  } else if (ctx.query.get('from')) {
    const inv = await repo.get('invoices', ctx.query.get('from'));
    draft = inv ? fromInvoice(inv, true) : blank();
    if (inv) dirty = true;
  } else draft = blank();
  if (notFound) { ctx.go('#/invoices'); return; }
  if (!draft.rows.length) draft.rows.push(newRow());

  ctx.setLeaveGuard(() => dirty && (draft.buyerName.trim() || draft.rows.some(r => r.code || r.cans || r.fee)));

  // ---------- محاسبه ----------
  const globalsInfo = () => {
    const d = parsePercentBP(draft.discountPct, 10000), t = parsePercentBP(draft.taxPct, taxMaxBP);
    return { d, t, g: { discountBP: d.ok ? d.bp : 0, taxBP: t.ok ? t.bp : 0, mode: G.rounding } };
  };
  function evalRow(r, gi) {
    const own = (k) => String(r[k] ?? '').trim() !== '';
    const res = evaluateRow({ ...r, product: r.product }, gi.g, opts);
    // درصد کلی نامعتبر => ردیف‌هایی که درصد اختصاصی ندارند نباید عددی تولید کنند
    if (res.status === 'ok' || res.status === 'incomplete') {
      const errs = { ...res.errors };
      if (!gi.d.ok && !own('discountPct')) errs.discountPct = 'درصد تخفیف کلی نامعتبر است.';
      if (!gi.t.ok && !own('taxPct')) errs.taxPct = 'درصد مالیات کلی نامعتبر است.';
      if (Object.keys(errs).length > Object.keys(res.errors).length) return { status: 'invalid', errors: errs };
    }
    return res;
  }

  // ---------- ساخت رابط ----------
  let tbody, tfoot, summaryEls = {}, mbarTotal, fHead = {}, titleEl, saveBtns = [];
  const sugg = h('ul', { class: 'sugg', role: 'listbox', hidden: true });
  document.body.append(sugg);
  ctx.onLeave(() => sugg.remove());
  let suggFor = null, suggIdx = -1, suggItems = [];

  function hideSugg() { sugg.hidden = true; suggFor = null; suggIdx = -1; }
  function showSugg(input, row) {
    suggItems = searchProducts(input.value);
    const exact = row.product && suggItems.length === 1 && suggItems[0].code === row.product.code;
    if (!suggItems.length || exact) return hideSugg();
    suggFor = { input, row }; suggIdx = -1;
    sugg.replaceChildren(...suggItems.map((p, i) => h('li', { role: 'option', onMousedown: e => { e.preventDefault(); pick(i); } },
      h('span', { class: 'sc', dir: 'ltr' }, p.code), h('span', { class: 'sd' }, p.name), h('span', { class: 'sn' }, `${formatInt(p.perCarton)} در کارتن`))));
    const r = input.getBoundingClientRect();
    sugg.style.top = r.bottom + 2 + 'px'; sugg.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; sugg.style.minWidth = Math.max(280, r.width) + 'px';
    sugg.hidden = false;
  }
  function markSugg() { [...sugg.children].forEach((li, i) => li.classList.toggle('on', i === suggIdx)); }
  function pick(i) {
    const p = suggItems[i]; if (!p || !suggFor) return;
    const { input, row } = suggFor;
    input.value = p.code; row.code = p.code; row.product = p; hideSugg(); onRowChange(row); row._el.cans.focus();
  }

  function numInput(row, key, { inputmode = 'numeric', placeholder = '' } = {}) {
    const i = h('input', { class: 'input num-in', dir: 'ltr', inputmode, autocomplete: 'off', placeholder, value: row[key] });
    i.addEventListener('input', () => { row[key] = i.value; onRowChange(row); });
    i.addEventListener('blur', () => {
      row.touched = true;
      const t = cleanNumberText(i.value);
      if (/^\d+$/.test(t) && (key === 'cans' || key === 'fee')) i.value = formatInt(Number(t)); // فقط مقدار معتبر قالب‌بندی می‌شود
      onRowChange(row);
    });
    return i;
  }

  function rowEl(row, idx) {
    const code = h('input', { class: 'input', dir: 'ltr', autocomplete: 'off', role: 'combobox', 'aria-autocomplete': 'list', placeholder: 'کد کالا', value: row.code });
    code.addEventListener('input', () => { row.code = code.value; row.product = findProduct(code.value); onRowChange(row); showSugg(code, row); });
    code.addEventListener('focus', () => { if (code.value && !row.product) showSugg(code, row); });
    code.addEventListener('blur', () => { row.touched = true; setTimeout(hideSugg, 120); const p = findProduct(code.value); if (p) { row.product = p; if (code.value !== p.code) { code.value = p.code; row.code = p.code; } } onRowChange(row); });
    code.addEventListener('keydown', e => {
      if (sugg.hidden || suggFor?.input !== code) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); suggIdx = (suggIdx + 1) % suggItems.length; markSugg(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); suggIdx = (suggIdx - 1 + suggItems.length) % suggItems.length; markSugg(); }
      else if (e.key === 'Enter' && suggIdx >= 0) { e.preventDefault(); pick(suggIdx); }
      else if (e.key === 'Escape') { e.stopPropagation(); hideSugg(); }
    });
    const cans = numInput(row, 'cans'), fee = numInput(row, 'fee', { inputmode: G.allowDecimalFee ? 'decimal' : 'numeric' });
    const dPct = numInput(row, 'discountPct', { inputmode: 'decimal', placeholder: '٪' }), tPct = numInput(row, 'taxPct', { inputmode: 'decimal', placeholder: '٪' });
    dPct.classList.add('pct'); tPct.classList.add('pct');
    dPct.setAttribute('aria-label', 'درصد تخفیف اختصاصی این ردیف'); tPct.setAttribute('aria-label', 'درصد مالیات اختصاصی این ردیف');
    const mk = (cls) => h('span', { class: cls });
    const el = { code, cans, fee, dPct, tPct, idx: h('td', { 'data-label': 'ردیف', class: 'idx' }), desc: mk('desc-t'), cartons: mk('v'), gross: mk('v'), disc: mk('v'), tax: mk('v'), final: mk('v strong'),
      eCode: mk('cell-err'), eCans: mk('cell-err'), eFee: mk('cell-err'), eD: mk('cell-err'), eT: mk('cell-err') };
    const del = h('button', { class: 'icon-btn danger-t', type: 'button', title: 'حذف ردیف', 'aria-label': 'حذف ردیف', onClick: () => removeRow(row) }, icon('trash'));
    const tr = h('tr', { class: 'irow' },
      el.idx,
      h('td', { 'data-label': 'کد کالا' }, code, el.eCode),
      h('td', { 'data-label': 'شرح کالا', class: 'desc' }, el.desc),
      h('td', { 'data-label': 'تعداد (کارتن)', class: 'num' }, el.cartons),
      h('td', { 'data-label': 'تعداد (قوطی)' }, cans, el.eCans),
      h('td', { 'data-label': 'فی (ریال)' }, fee, el.eFee),
      h('td', { 'data-label': 'مبلغ', class: 'num' }, el.gross),
      h('td', { 'data-label': 'تخفیف', class: 'num' }, el.disc, dPct, el.eD),
      h('td', { 'data-label': 'مالیات', class: 'num' }, el.tax, tPct, el.eT),
      h('td', { 'data-label': 'جمع کل با مالیات', class: 'num' }, el.final),
      h('td', { class: 'acts' }, del));
    row._el = el; row._tr = tr;
    return tr;
  }

  function buildRows() {
    tbody.replaceChildren(...draft.rows.map(rowEl));
    recalc();
  }
  function removeRow(row) {
    const filled = row.code || row.cans || row.fee;
    const doIt = () => { draft.rows = draft.rows.filter(r => r !== row); if (!draft.rows.length) draft.rows.push(newRow()); dirty = true; buildRows(); };
    if (filled) confirmBox({ title: 'حذف ردیف', message: 'این ردیف حذف شود؟', okText: 'حذف', danger: true }).then(ok => ok && doIt()); else doIt();
  }
  function addRow(focus = true) {
    const r = newRow(); draft.rows.push(r); tbody.append(rowEl(r)); recalc();
    if (focus) r._el.code.focus();
  }

  function onRowChange() { dirty = true; recalc(); }

  function recalc() {
    const gi = globalsInfo();
    fHead.discountPct?.setError(gi.d.ok ? '' : (gi.d.empty ? 'درصد تخفیف کلی الزامی است (۰ مجاز است).' : gi.d.error));
    fHead.taxPct?.setError(gi.t.ok ? '' : (gi.t.empty ? 'درصد مالیات کلی الزامی است (۰ مجاز است).' : gi.t.error));
    const okRows = [];
    let n = 0;
    for (const r of draft.rows) {
      const res = evalRow(r, gi); r._res = res; const e = r._el;
      const filled = res.status !== 'empty';
      if (filled) n++;
      e.idx.textContent = filled ? toFaDigits(n) : '';
      e.desc.textContent = r.product ? r.product.name : '';
      const showErr = k => (r.touched || submitted || String(r[k] ?? '').trim() !== '') ? res.errors[k] || '' : '';
      const map = { code: 'eCode', cans: 'eCans', fee: 'eFee', discountPct: 'eD', taxPct: 'eT' };
      const inp = { code: e.code, cans: e.cans, fee: e.fee, discountPct: e.dPct, taxPct: e.tPct };
      for (const k of Object.keys(map)) {
        let msg = showErr(k);
        if ((k === 'code' || k === 'cans' || k === 'fee') && res.status === 'incomplete' && !(r.touched || submitted)) msg = '';
        e[map[k]].textContent = msg; inp[k].classList.toggle('err', !!msg);
      }
      if (r.product && !res.errors.cans && String(r.cans).trim()) {
        const c = Number(cleanNumberText(r.cans));
        e.cartons.textContent = Number.isSafeInteger(c) && c > 0 ? formatDec(cartonsX100(c, r.product.perCarton) / 100) : '';
      } else e.cartons.textContent = '';
      if (res.status === 'ok') {
        const c = res.calc;
        e.gross.textContent = formatInt(c.gross); e.disc.textContent = formatInt(c.discount); e.tax.textContent = formatInt(c.tax); e.final.textContent = formatInt(c.final);
        okRows.push({ r, calc: c, cans: res.parsed.cans, parsed: res.parsed });
      } else { e.gross.textContent = e.disc.textContent = e.tax.textContent = e.final.textContent = ''; }
      r._tr.classList.toggle('bad', (res.status === 'invalid' || res.status === 'incomplete') && (r.touched || submitted));
      r._tr.classList.toggle('good', res.status === 'ok');
      e.dPct.placeholder = gi.d.ok ? toFaDigits(String(gi.d.bp / 100)) + '٪' : '٪'; e.tPct.placeholder = gi.t.ok ? toFaDigits(String(gi.t.bp / 100)) + '٪' : '٪';
    }
    const t = sumTotals(okRows);
    draft._ok = okRows; draft._totals = t;
    const I = formatInt;
    tfoot.cartons.textContent = formatDec(t.cartons); tfoot.cans.textContent = I(t.cans); tfoot.gross.textContent = I(t.gross);
    tfoot.disc.textContent = I(t.discount); tfoot.tax.textContent = I(t.tax); tfoot.final.textContent = I(t.final);
    summaryEls.gross.textContent = I(t.gross); summaryEls.disc.textContent = I(t.discount); summaryEls.net.textContent = I(t.net);
    summaryEls.tax.textContent = I(t.tax); summaryEls.final.textContent = I(t.grand); mbarTotal.textContent = I(t.grand);
    summaryEls.warn.hidden = t.consistent;
  }

  // ---------- فرم بالای صفحه ----------
  const bindInput = (key, input, after) => { input.addEventListener('input', () => { draft[key] = input.value; dirty = true; after?.(); recalc(); }); return input; };
  const sellerInput = h('input', { class: 'input', readonly: true, value: draft.sellerName || G.companyName || '', placeholder: 'در تنظیمات ثبت کنید', 'aria-readonly': 'true' });
  const lineSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'لاین فروش' }, ['1', '2'].map(v => {
    const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(draft.line === v), class: draft.line === v ? 'on' : '', onClick: () => { draft.line = v; dirty = true; [...lineSeg.children].forEach(c => { const on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-checked', String(on)); }); } }, v === '1' ? 'یک' : 'دو');
    return b;
  }));
  const dateIn = h('input', { class: 'input', dir: 'ltr', value: draft.date, inputmode: 'numeric', placeholder: '1405/07/22', autocomplete: 'off' });
  const buyerIn = h('input', { class: 'input', value: draft.buyerName, autocomplete: 'off' });
  const buyerCodeIn = h('input', { class: 'input', dir: 'ltr', value: draft.buyerCode, autocomplete: 'off' });
  const discIn = h('input', { class: 'input', dir: 'ltr', inputmode: 'decimal', value: draft.discountPct });
  const taxIn = h('input', { class: 'input', dir: 'ltr', inputmode: 'decimal', value: draft.taxPct });
  fHead.date = field('تاریخ', dateIn, { hint: 'قالب ۱۴۰۵/۰۷/۲۲' });
  fHead.buyerName = field('نام خریدار', buyerIn);
  fHead.discountPct = field('درصد تخفیف کلی', discIn, { hint: 'پیش‌فرض ردیف‌ها' });
  fHead.taxPct = field('درصد مالیات کلی', taxIn, { hint: `سقف مجاز: ${formatInt(G.taxMaxPct)}` });
  const validateDate = () => { const p = J.parse(dateIn.value); fHead.date.setError(p.ok ? '' : p.error); return p; };
  dateIn.addEventListener('input', () => { draft.date = dateIn.value; dirty = true; validateDate(); });
  dateIn.addEventListener('blur', () => { const p = J.parse(dateIn.value); if (p.ok) { dateIn.value = p.text; draft.date = p.text; } });
  bindInput('buyerName', buyerIn, () => fHead.buyerName.setError(buyerIn.value.trim() ? '' : 'نام خریدار الزامی است.'));
  bindInput('buyerCode', buyerCodeIn); bindInput('discountPct', discIn); bindInput('taxPct', taxIn);

  const dateField = fHead.date; attachDatePicker(dateIn);

  // ---------- جدول ----------
  const heads = ['ردیف', 'کد کالا', 'شرح کالا', 'تعداد (کارتن)', 'تعداد (قوطی)', 'فی (ریال)', 'مبلغ', 'تخفیف', 'مالیات', 'جمع کل با مالیات', ''];
  tbody = h('tbody');
  const tc = () => h('td', { class: 'num strong' });
  tfoot = { cartons: tc(), cans: tc(), gross: tc(), disc: tc(), tax: tc(), final: tc() };
  const tfootEl = h('tfoot', {}, h('tr', { class: 'tot' }, h('td', { colspan: 3 }, 'جمع کل'), tfoot.cartons, tfoot.cans, h('td', {}), tfoot.gross, tfoot.disc, tfoot.tax, tfoot.final, h('td', {})));

  const sv = (label, key, strong) => { const v = h('span', { class: 'sv' }); summaryEls[key] = v; return h('div', { class: `sum-row${strong ? ' big' : ''}` }, h('span', {}, label), v); };
  summaryEls.warn = h('div', { class: 'ferr', hidden: true, role: 'alert' }, 'خطای داخلی: جمع‌ها با هم نمی‌خوانند. لطفاً صفحه را بازبینی کنید.');
  const summary = h('section', { class: 'card summary' },
    sv('مجموع پیش از تخفیف', 'gross'), sv('مجموع تخفیف', 'disc'), sv('مبلغ پس از تخفیف', 'net'), sv('مجموع مالیات', 'tax'), sv('مبلغ نهایی (ریال)', 'final', true), summaryEls.warn);

  // ---------- عملیات ----------
  function validateHeader() {
    let ok = true;
    const d = validateDate(); if (!d.ok) ok = false; else { dateIn.value = d.text; draft.date = d.text; }
    if (!draft.buyerName.trim()) { fHead.buyerName.setError('نام خریدار الزامی است.'); ok = false; } else fHead.buyerName.setError('');
    const gi = globalsInfo(); if (!gi.d.ok || !gi.t.ok) ok = false;
    if (!ok) view.querySelector('.err')?.focus();
    return ok;
  }
  function buildInvoice() {
    const rows = draft._ok.map(({ r, calc, parsed }) => ({
      code: r.product.code, name: r.product.name, perCarton: r.product.perCarton, cans: parsed.cans, cartons: calc.cartons, fee: parsed.fee,
      discountPct: parsed.ownDiscount ? cleanNumberText(r.discountPct) : null, taxPct: parsed.ownTax ? cleanNumberText(r.taxPct) : null,
      gross: calc.gross, discount: calc.discount, net: calc.net, tax: calc.tax, final: calc.final,
    }));
    const t = draft._totals;
    return {
      id: draft.id, number: draft.number, date: draft.date, line: draft.line,
      sellerName: draft.sellerName || G.companyName, currency: G.currency,
      buyerName: draft.buyerName.trim(), buyerCode: draft.buyerCode.trim(),
      discountPct: cleanNumberText(draft.discountPct), taxPct: cleanNumberText(draft.taxPct), rounding: G.rounding,
      rows, totals: { cartons: t.cartons, cans: t.cans, gross: t.gross, discount: t.discount, net: t.net, tax: t.tax, final: t.grand },
    };
  }
  const printModel = () => ({ ...buildInvoice(), currency: G.currency });

  async function save() {
    submitted = true; recalc();
    if (!validateHeader()) { toast('اطلاعات بالای فرم را کامل یا اصلاح کنید.', 'err'); return null; }
    if (!draft._ok.length) { toast('حداقل یک ردیف کامل لازم است.', 'err'); view.querySelector('.irow .err')?.focus(); return null; }
    const bad = draft.rows.filter(r => ['invalid', 'incomplete'].includes(r._res.status));
    if (bad.length && !await confirmBox({ title: 'ردیف‌های ناقص', message: `${formatInt(bad.length)} ردیف ناقص یا نامعتبر است و ذخیره نمی‌شود. ادامه می‌دهید؟`, okText: 'ذخیره بدون این ردیف‌ها' })) return null;
    if (bad.length) { draft.rows = draft.rows.filter(r => !bad.includes(r)); submitted = false; buildRows(); }
    const inv = buildInvoice();
    const saved = await repo.saveInvoice(inv, Math.max(1, Number(G.startNumber) || 1));
    draft.id = saved.id; draft.number = saved.number; draft.sellerName = saved.sellerName; dirty = false;
    history.replaceState(null, '', `#/invoice/${saved.id}`);
    titleEl.textContent = `ویرایش پیش‌فاکتور شماره ${formatInt(saved.number)}`;
    toast(`پیش‌فاکتور شماره ${formatInt(saved.number)} ذخیره شد.`);
    return saved;
  }
  function ensurePrintable() {
    submitted = true; recalc();
    if (!validateHeader()) { toast('اطلاعات بالای فرم را کامل یا اصلاح کنید.', 'err'); return false; }
    if (!draft._ok.length) { toast('حداقل یک ردیف کامل لازم است.', 'err'); return false; }
    return true;
  }
  const preview = () => { if (ensurePrintable()) showPreviewModal(printModel()); };
  const doPrint = () => { if (!ensurePrintable()) return; const m = printModel(); printHTML(buildDocument(m, S.activeTemplate().config), pdfFileName(m)); };
  const saveAndPrint = async () => { if (!ensurePrintable()) return; const s = await save(); if (s) { const m = { ...s, currency: G.currency }; printHTML(buildDocument(m, S.activeTemplate().config), pdfFileName(m)); } };
  async function fresh() {
    if (dirty && (draft.buyerName.trim() || draft.rows.some(r => r.code || r.cans || r.fee)) && !await confirmBox({ title: 'پیش‌فاکتور تازه', message: 'تغییرات ذخیره‌نشده از بین می‌رود. ادامه می‌دهید؟', okText: 'ادامه' })) return;
    dirty = false; history.replaceState(null, '', '#/invoice'); ctx.rerender();
  }

  titleEl = h('h2', {}, draft.id ? `ویرایش پیش‌فاکتور شماره ${formatInt(draft.number)}` : 'پیش‌فاکتور جدید');
  const actions = h('div', { class: 'actions' },
    btn('ذخیره', { cls: 'primary', ic: 'save', onClick: save }),
    btn('ذخیره و چاپ', { ic: 'print', onClick: saveAndPrint }),
    btn('پیش‌نمایش چاپ', { ic: 'eye', onClick: preview }),
    btn('چاپ / PDF', { ic: 'print', onClick: doPrint }),
    btn('پیش‌فاکتور تازه', { ic: 'plus', onClick: fresh }));

  mbarTotal = h('strong', {});
  const mbar = h('div', { class: 'mbar' }, h('span', {}, 'مبلغ نهایی (ریال)'), mbarTotal);

  view.replaceChildren(
    h('div', { class: 'page-head' }, titleEl, actions),
    h('section', { class: 'card' }, h('div', { class: 'form-grid' },
      field('فروشنده', sellerInput), field('لاین فروش', lineSeg), dateField, fHead.buyerName,
      field('کد خریدار', buyerCodeIn, { hint: 'اختیاری' }), fHead.discountPct, fHead.taxPct)),
    h('section', { class: 'card flush items-card' },
      h('div', { class: 'tbl-wrap items-wrap' }, h('table', { class: 'tbl items-tbl' },
        h('thead', {}, h('tr', {}, heads.map(x => h('th', {}, x)))), tbody, tfootEl)),
      h('div', { class: 'items-foot' }, btn('افزودن کالا', { ic: 'plus', onClick: () => addRow(true) }),
        h('span', { class: 'muted small' }, 'فی قیمت یک قوطی است. درصد خالی در هر ردیف = درصد کلی.'))),
    summary, mbar,
  );
  buildRows();
  dirty = ctx.query.get('from') ? true : false;
  if (!draft.id && !ctx.query.get('from')) buyerIn.focus();
}
