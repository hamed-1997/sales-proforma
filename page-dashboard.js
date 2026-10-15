import { repo } from './db.js';
import { formatInt, toFaDigits } from './format.js';
import * as J from './jalali.js';
import * as S from './settings.js';
import { h, btn, icon } from './ui.js';

export async function render(view, { go }) {
  const [invoices, pCount] = await Promise.all([repo.getAll('invoices'), repo.count('products')]);
  const monthPrefix = J.today().slice(0, 8);
  const inMonth = invoices.filter(i => (i.date || '').startsWith(monthPrefix)).length;
  const last = invoices.slice().sort((a, b) => b.number - a.number).slice(0, 5);
  const stat = (label, val) => h('div', { class: 'stat' }, h('div', { class: 'stat-val' }, formatInt(val)), h('div', { class: 'stat-lbl' }, label));

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('h2', {}, 'داشبورد'), btn('پیش‌فاکتور جدید', { cls: 'primary', ic: 'plus', onClick: () => go('#/invoice') })),
    h('div', { class: 'stats' }, stat('کل پیش‌فاکتورها', invoices.length), stat('پیش‌فاکتورهای این ماه', inMonth), stat('کالاهای بانک', pCount)),
    h('section', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, 'پنج پیش‌فاکتور آخر'), btn('بانک کالا', { ic: 'box', onClick: () => go('#/products') })),
      last.length ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['شماره', 'تاریخ', 'لاین', 'خریدار', 'مبلغ نهایی (ریال)'].map(x => h('th', {}, x)))),
        h('tbody', {}, last.map(i => h('tr', { class: 'clickable', tabindex: 0, onClick: () => go(`#/invoice/${i.id}`), onKeydown: e => { if (e.key === 'Enter') go(`#/invoice/${i.id}`); } },
          h('td', {}, formatInt(i.number)), h('td', { dir: 'ltr' }, i.date), h('td', {}, toFaDigits(i.line)), h('td', {}, i.buyerName), h('td', { class: 'num' }, formatInt(i.totals.final)))))))
      : h('div', { class: 'empty' }, h('p', {}, 'هنوز پیش‌فاکتوری صادر نشده است.'), btn('اولین پیش‌فاکتور را بسازید', { cls: 'primary', ic: 'plus', onClick: () => go('#/invoice') })),
    ),
    !S.state.general.companyName ? h('div', { class: 'notice' }, 'نام شرکت (فروشنده) هنوز ثبت نشده است. ', h('a', { href: '#/settings' }, 'تنظیمات عمومی را کامل کنید.')) : null,
  );
}
