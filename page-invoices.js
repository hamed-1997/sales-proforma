import { repo } from './db.js';
import { formatInt, normSearch, lineLabel } from './format.js';
import * as J from './jalali.js';
import * as S from './settings.js';
import { buildDocument, printHTML, pdfFileName, modelFromInvoice } from './print.js';
import { h, btn, icon, confirmBox, toast, attachDatePicker } from './ui.js';
import { showPreviewModal } from './page-common.js';

const PER = 15;

export async function render(view, { go }) {
  let all = await repo.getAll('invoices');
  const f = { q: '', from: '', to: '', line: '', sort: 'number-desc' };
  let page = 1;
  const q = h('input', { type: 'search', class: 'input', placeholder: 'جستجو: شماره، نام یا کد خریدار', 'aria-label': 'جستجو' });
  const from = h('input', { class: 'input', dir: 'ltr', placeholder: 'از تاریخ', 'aria-label': 'از تاریخ' });
  const to = h('input', { class: 'input', dir: 'ltr', placeholder: 'تا تاریخ', 'aria-label': 'تا تاریخ' });
  const line = h('select', { class: 'input', 'aria-label': 'لاین' }, h('option', { value: '' }, 'همه‌ی لاین‌ها'), h('option', { value: '1' }, 'لاین یک'), h('option', { value: '2' }, 'لاین دو'));
  const sort = h('select', { class: 'input', 'aria-label': 'مرتب‌سازی' },
    [['number-desc', 'شماره (نزولی)'], ['number-asc', 'شماره (صعودی)'], ['date-desc', 'تاریخ (جدیدترین)'], ['date-asc', 'تاریخ (قدیمی‌ترین)'], ['buyer-asc', 'خریدار (الف تا ی)'], ['total-desc', 'مبلغ (بیشترین)'], ['total-asc', 'مبلغ (کمترین)']].map(([v, l]) => h('option', { value: v }, l)));
  const tbody = h('tbody'), pager = h('div', { class: 'pager' }), count = h('span', { class: 'muted' });

  function filtered() {
    const n = normSearch(f.q);
    const fd = J.parse(f.from), td = J.parse(f.to);
    let r = all.filter(i =>
      (!n || String(i.number) === n || normSearch(i.buyerName).includes(n) || normSearch(i.buyerCode || '').includes(n)) &&
      (!f.line || i.line === f.line) && (!fd.ok || i.date >= fd.text) && (!td.ok || i.date <= td.text));
    const [k, dir] = f.sort.split('-'), m = dir === 'asc' ? 1 : -1;
    const key = { number: i => i.number, date: i => i.date + String(i.number).padStart(9, '0'), buyer: i => i.buyerName, total: i => i.totals.final }[k];
    return r.sort((a, b) => { const x = key(a), y = key(b); return (typeof x === 'string' ? x.localeCompare(y, 'fa') : x - y) * m; });
  }
  function draw() {
    const list = filtered(), pages = Math.max(1, Math.ceil(list.length / PER));
    page = Math.min(page, pages);
    count.textContent = `${formatInt(list.length)} پیش‌فاکتور`;
    tbody.replaceChildren(...(list.slice((page - 1) * PER, page * PER).map(i => h('tr', {},
      h('td', {}, h('span', { class: 'badge' }, formatInt(i.number))), h('td', { dir: 'ltr' }, i.date), h('td', {}, lineLabel(i.line)),
      h('td', { class: 'desc' }, i.buyerName, i.buyerCode ? h('span', { class: 'muted small' }, ` (${i.buyerCode})`) : null),
      h('td', {}, formatInt(i.rows.length)), h('td', { class: 'num strong' }, formatInt(i.totals.final)),
      h('td', { class: 'acts' },
        ib('eye', 'مشاهده', () => showPreviewModal({ ...modelFromInvoice(i), currency: i.currency || S.state.general.currency }, { extraActions: [btn('ویرایش', { ic: 'edit', onClick: () => go(`#/invoice/${i.id}`) })] })),
        ib('edit', 'ویرایش', () => go(`#/invoice/${i.id}`)),
        ib('copy', 'ساخت نسخه‌ی جدید از روی این', () => go(`#/invoice?from=${i.id}`)),
        ib('print', 'چاپ', () => { const m = { ...modelFromInvoice(i), currency: i.currency || S.state.general.currency }; printHTML(buildDocument(m, S.activeTemplate().config), pdfFileName(m)); }),
        ib('trash', 'حذف', () => remove(i), true))))
      .concat(list.length ? [] : [h('tr', {}, h('td', { colspan: 7, class: 'empty-cell' }, all.length ? 'پیش‌فاکتوری با این فیلتر پیدا نشد.' : 'هنوز پیش‌فاکتوری ثبت نشده است.'))])));
    pager.replaceChildren(...(pages > 1 ? [btn('قبلی', { onClick: () => { page--; draw(); } }), h('span', {}, `صفحه ${formatInt(page)} از ${formatInt(pages)}`), btn('بعدی', { onClick: () => { page++; draw(); } })] : []));
    if (pager.children[0]) { if (page <= 1) pager.children[0].setAttribute('disabled', ''); if (page >= pages) pager.children[2].setAttribute('disabled', ''); }
  }
  const ib = (ic, label, fn, danger) => h('button', { class: `icon-btn${danger ? ' danger-t' : ''}`, type: 'button', title: label, 'aria-label': label, onClick: fn }, icon(ic));
  async function remove(i) {
    if (!await confirmBox({ title: 'حذف پیش‌فاکتور', message: `پیش‌فاکتور شماره ${formatInt(i.number)} (${i.buyerName}) برای همیشه حذف شود؟`, okText: 'حذف', danger: true })) return;
    await repo.del('invoices', i.id); all = all.filter(x => x.id !== i.id); draw(); toast('پیش‌فاکتور حذف شد.');
  }
  const bind = (el, k) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { f[k] = el.value; page = 1; draw(); });
  bind(q, 'q'); bind(from, 'from'); bind(to, 'to'); bind(line, 'line'); bind(sort, 'sort');
  from.addEventListener('change', () => { f.from = from.value; page = 1; draw(); }); to.addEventListener('change', () => { f.to = to.value; page = 1; draw(); });

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'فهرست پیش‌فاکتورها'), h('div', { class: 'sub' }, 'جست‌وجو، ویرایش، تکثیر و چاپ اسناد')), btn('پیش‌فاکتور جدید', { cls: 'primary', ic: 'plus', onClick: () => go('#/invoice') })),
    h('div', { class: 'toolbar wrap' }, q, from, to, line, sort, count),
    h('section', { class: 'card flush' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['شماره', 'تاریخ', 'لاین', 'خریدار', 'ردیف', 'مبلغ نهایی (ریال)', ''].map(x => h('th', {}, x)))), tbody))),
    pager,
  );
  attachDatePicker(from); attachDatePicker(to);
  draw();
}
