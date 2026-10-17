import { repo } from './db.js';
import { formatInt, toFaDigits, lineLabel } from './format.js';
import * as J from './jalali.js';
import * as S from './settings.js';
import { modelFromInvoice } from './print.js';
import { h, btn, icon, countUp } from './ui.js';
import { showPreviewModal } from './page-common.js';

const p2 = n => String(n).padStart(2, '0');
/** نمایش فشرده‌ی مبلغ برای زیر ستون‌های نمودار */
function short(v) {
  if (v >= 1e9) return toFaDigits((v / 1e9).toFixed(1).replace(/\.0$/, '').replace('.', '٫')) + ' میلیارد';
  if (v >= 1e6) return toFaDigits(String(Math.round(v / 1e6))) + ' میلیون';
  if (v >= 1e3) return toFaDigits(String(Math.round(v / 1e3))) + ' هزار';
  return toFaDigits(String(v));
}

export async function render(view, { go }) {
  const [invoices, pCount] = await Promise.all([repo.getAll('invoices'), repo.count('products')]);
  const today = J.today(), monthPrefix = today.slice(0, 8);
  const inMonth = invoices.filter(i => (i.date || '').startsWith(monthPrefix));
  const inToday = invoices.filter(i => i.date === today).length;
  const monthTotal = inMonth.reduce((a, i) => a + (i.totals?.final || 0), 0);
  const last = invoices.slice().sort((a, b) => b.number - a.number).slice(0, 6);
  const { jy, jm } = J.parse(today);

  // شش ماه شمسی آخر (داده‌ی واقعی مجموع مبلغ نهایی پیش‌فاکتورها)
  const months = [];
  for (let k = 5, y = jy, m = jm; k >= 0; k--) { months.unshift({ y, m }); m--; if (m < 1) { m = 12; y--; } }
  const sums = months.map(({ y, m }) => invoices.filter(i => (i.date || '').startsWith(`${y}/${p2(m)}/`)).reduce((a, i) => a + (i.totals?.final || 0), 0));
  const max = Math.max(...sums, 1);

  const stat = (ic, label, val, unit) => {
    const v = h('span', {}, '۰');
    queueMicrotask(() => countUp(v, val, formatInt));
    return h('div', { class: 'stat' }, h('div', { class: 'stat-ic' }, icon(ic)), h('div', {}, h('div', { class: 'stat-val' }, v, unit ? h('small', {}, unit) : null), h('div', { class: 'stat-lbl' }, label)));
  };
  const company = S.state.general.companyName;

  const chart = invoices.length
    ? h('div', { class: 'chart', role: 'img', 'aria-label': 'نمودار مجموع پیش‌فاکتورها در شش ماه اخیر' }, months.map(({ m }, i) =>
      h('div', { class: 'bar-col', title: `${J.MONTHS[m - 1]}: ${formatInt(sums[i])} ریال` },
        h('span', { class: 'bar-val' }, sums[i] ? short(sums[i]) : ''),
        h('div', { class: `bar${i === 5 ? ' cur' : ''}`, style: { height: Math.max(sums[i] / max * 150, sums[i] ? 6 : 3) + 'px', animationDelay: i * 70 + 'ms' } }),
        h('span', { class: 'bar-lbl' }, J.MONTHS[m - 1]))))
    : h('div', { class: 'empty' }, h('img', { src: 'logo-symbol.png', alt: '' }), h('p', {}, 'با اولین پیش‌فاکتور، نمودار ماهانه اینجا ساخته می‌شود.'));

  const recent = last.length
    ? h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['شماره', 'تاریخ', 'لاین', 'خریدار', 'ردیف', 'مبلغ نهایی (ریال)', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, last.map(i => h('tr', {},
        h('td', {}, h('span', { class: 'badge' }, formatInt(i.number))), h('td', { dir: 'ltr' }, i.date), h('td', {}, lineLabel(i.line)), h('td', { class: 'desc' }, i.buyerName),
        h('td', {}, formatInt(i.rows.length)), h('td', { class: 'num strong' }, formatInt(i.totals.final)),
        h('td', { class: 'acts' },
          h('button', { class: 'icon-btn', type: 'button', title: 'مشاهده و خروجی', 'aria-label': 'مشاهده', onClick: () => showPreviewModal({ ...modelFromInvoice(i), currency: i.currency || S.state.general.currency }, { extraActions: [btn('ویرایش', { ic: 'edit', onClick: () => go(`#/invoice/${i.id}`) })] }) }, icon('eye')),
          h('button', { class: 'icon-btn', type: 'button', title: 'ویرایش', 'aria-label': 'ویرایش', onClick: () => go(`#/invoice/${i.id}`) }, icon('edit'))))))))
    : h('div', { class: 'empty' }, h('img', { src: 'logo-symbol.png', alt: '' }), h('p', {}, 'هنوز پیش‌فاکتوری صادر نشده است.'), btn('اولین پیش‌فاکتور را بسازید', { cls: 'primary', ic: 'plus', onClick: () => go('#/invoice') }));

  view.replaceChildren(
    !company ? h('div', { class: 'notice' }, icon('info'), h('span', {}, 'نام شرکت (فروشنده) هنوز ثبت نشده است و روی پیش‌فاکتور خالی چاپ می‌شود. '), h('a', { href: '#/settings' }, 'تکمیل در تنظیمات')) : null,
    h('section', { class: 'card hero' },
      h('img', { src: 'logo-full.png', alt: 'Sales Proforma' }),
      h('div', {}, h('h2', {}, company ? `${company}` : 'خوش آمدید'), h('p', {}, 'پیش‌فاکتورها را سریع بسازید، کالاها را از بانک کالا انتخاب کنید و خروجی چاپی رسمی بگیرید. اطلاعات فقط روی همین دستگاه ذخیره می‌شود.'),
        h('div', { class: 'actions' }, btn('صدور پیش‌فاکتور جدید', { cls: 'primary', ic: 'plus', onClick: () => go('#/invoice') }), btn('بانک کالا', { ic: 'box', onClick: () => go('#/products') })))),
    h('div', { class: 'stats' },
      stat('clock', 'پیش‌فاکتورهای امروز', inToday), stat('cal', 'پیش‌فاکتورهای این ماه', inMonth.length),
      stat('file', 'کل پیش‌فاکتورها', invoices.length), stat('box', 'کالاهای ثبت‌شده', pCount)),
    h('div', { class: 'dash-grid' },
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, icon('chart'), 'مجموع پیش‌فاکتورها در شش ماه اخیر', h('small', {}, '(ریال)')),
          h('span', { class: 'badge cu' }, `این ماه: ${formatInt(monthTotal)}`)), chart),
      h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', { class: 'card-title' }, icon('layers'), 'دسترسی سریع')),
        h('div', { class: 'quick' },
          h('a', { href: '#/invoice' }, icon('plus'), h('span', {}, 'صدور پیش‌فاکتور', h('small', {}, 'ثبت پیش‌فاکتور تازه'))),
          h('a', { href: '#/invoices' }, icon('list'), h('span', {}, 'فهرست پیش‌فاکتورها', h('small', {}, 'جست‌وجو، ویرایش و چاپ'))),
          h('a', { href: '#/products' }, icon('box'), h('span', {}, 'بانک کالا', h('small', {}, 'افزودن یا واردکردن از Excel'))),
          h('a', { href: '#/settings' }, icon('gear'), h('span', {}, 'تنظیمات', h('small', {}, 'شرکت، چاپ و پشتیبان‌گیری')))))),
    h('section', { class: 'card flush' },
      h('div', { class: 'card-head', style: { padding: '1rem 1.3rem 0' } }, h('div', { class: 'card-title' }, icon('list'), 'آخرین پیش‌فاکتورها'), btn('همه‌ی پیش‌فاکتورها', { cls: 'sm', onClick: () => go('#/invoices') })), recent),
  );
}
