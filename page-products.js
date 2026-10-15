import { repo } from './db.js';
import { parseUInt, formatInt, normSearch } from './format.js';
import { readFileRows, validateRows, normCode, downloadSample, exportProducts } from './importer.js';
import { h, btn, icon, modal, confirmBox, field, toast } from './ui.js';
import { products, refreshProducts, findProduct, codeKey } from './page-common.js';

const PAGE = 50;

export async function render(view) {
  await refreshProducts();
  let q = '', page = 1;
  const search = h('input', { type: 'search', class: 'input', placeholder: 'جستجو بر اساس کد یا شرح…', 'aria-label': 'جستجو' });
  const tbody = h('tbody'), pager = h('div', { class: 'pager' }), count = h('span', { class: 'muted' });
  const fileIn = h('input', { type: 'file', accept: '.xlsx,.xls,.csv', hidden: true });

  function list() {
    const n = normSearch(q);
    return n ? products.filter(p => normSearch(p.code).includes(n) || normSearch(p.name).includes(n)) : products;
  }
  function draw() {
    const all = list(), pages = Math.max(1, Math.ceil(all.length / PAGE));
    page = Math.min(page, pages);
    const slice = all.slice((page - 1) * PAGE, page * PAGE);
    count.textContent = `${formatInt(all.length)} کالا`;
    tbody.replaceChildren(...(slice.length ? slice.map(p => h('tr', {},
      h('td', { dir: 'ltr', class: 'code' }, p.code), h('td', { class: 'desc' }, p.name), h('td', { class: 'num' }, formatInt(p.perCarton)),
      h('td', { class: 'acts' },
        h('button', { class: 'icon-btn', type: 'button', title: 'ویرایش', 'aria-label': `ویرایش ${p.code}`, onClick: () => edit(p) }, icon('edit')),
        h('button', { class: 'icon-btn danger-t', type: 'button', title: 'حذف', 'aria-label': `حذف ${p.code}`, onClick: () => remove(p) }, icon('trash'))),
    )) : [h('tr', {}, h('td', { colspan: 4, class: 'empty-cell' }, products.length ? 'کالایی با این جستجو پیدا نشد.' : 'بانک کالا خالی است. کالا را دستی اضافه کنید یا از Excel وارد کنید.'))]));
    pager.replaceChildren(...(pages > 1 ? [
      btn('قبلی', { onClick: () => { page--; draw(); } }), h('span', {}, `صفحه ${formatInt(page)} از ${formatInt(pages)}`), btn('بعدی', { onClick: () => { page++; draw(); } }),
    ] : []));
    pager.children[0] && (page <= 1 ? pager.children[0].setAttribute('disabled', '') : 0);
    pager.children[2] && (page >= pages ? pager.children[2].setAttribute('disabled', '') : 0);
  }
  search.addEventListener('input', () => { q = search.value; page = 1; draw(); });

  async function remove(p) {
    if (!await confirmBox({ title: 'حذف کالا', message: `کالای «${p.code} — ${p.name}» از بانک حذف شود؟ پیش‌فاکتورهای قبلی تغییر نمی‌کنند.`, okText: 'حذف', danger: true })) return;
    await repo.del('products', p.code); await refreshProducts(); draw(); toast('کالا حذف شد.');
  }

  function edit(p) {
    const isNew = !p;
    const code = h('input', { class: 'input', dir: 'ltr', value: p?.code ?? '', autofocus: true, autocomplete: 'off' });
    const name = h('input', { class: 'input', value: p?.name ?? '' });
    const per = h('input', { class: 'input', dir: 'ltr', inputmode: 'numeric', value: p ? String(p.perCarton) : '' });
    const fc = field('کد کالا', code), fn = field('شرح کالا', name), fp = field('تعداد قوطی در کارتن', per);
    const validate = () => {
      let ok = true;
      const c = normCode(code.value);
      const dup = c && findProduct(c);
      if (!c) { fc.setError('کد کالا الزامی است.'); ok = false; }
      else if (dup && (isNew || codeKey(dup.code) !== codeKey(p.code))) { fc.setError('این کد قبلاً در بانک ثبت شده است.'); ok = false; } else fc.setError('');
      if (!name.value.trim()) { fn.setError('شرح کالا الزامی است.'); ok = false; } else fn.setError('');
      const n = parseUInt(per.value);
      if (!n.ok) { fp.setError(n.empty ? 'تعداد در کارتن الزامی است.' : n.error); ok = false; }
      else if (n.value <= 0) { fp.setError('تعداد در کارتن باید بزرگ‌تر از صفر باشد.'); ok = false; } else fp.setError('');
      return ok ? { code: c, name: name.value.trim(), perCarton: n.value } : null;
    };
    [code, name, per].forEach(i => i.addEventListener('input', validate));
    const save = async () => {
      const v = validate(); if (!v) return;
      if (!isNew && codeKey(v.code) !== codeKey(p.code)) await repo.del('products', p.code);
      await repo.put('products', v); await refreshProducts(); m.close(); draw(); toast(isNew ? 'کالا افزوده شد.' : 'کالا ویرایش شد.');
    };
    const onEnter = e => { if (e.key === 'Enter') save(); };
    [code, name, per].forEach(i => i.addEventListener('keydown', onEnter));
    const m = modal({ title: isNew ? 'افزودن کالا' : 'ویرایش کالا', body: h('div', { class: 'form-grid one' }, fc, fn, fp), actions: [btn('ذخیره', { cls: 'primary', ic: 'save', onClick: save }), btn('انصراف', { onClick: () => m.close() })] });
  }

  async function importFile(file) {
    let rows;
    try { rows = await readFileRows(file); } catch (e) { toast('خواندن فایل ناموفق بود: ' + e.message, 'err'); return; }
    const res = validateRows(rows, new Set(products.map(p => p.code)));
    const errList = res.errors.length ? h('div', { class: 'err-list' }, h('strong', {}, `ردیف‌های ردشده (${formatInt(res.errors.length)}):`),
      h('ul', {}, res.errors.map(e => h('li', {}, `ردیف ${formatInt(e.line)}: ${e.reason}`)))) : null;
    const warnList = res.warnings.length ? h('div', { class: 'warn-list' }, h('ul', {}, res.warnings.map(w => h('li', {}, w)))) : null;
    const sum = (r) => h('div', { class: 'import-sum' },
      h('div', { class: 'stat sm' }, h('div', { class: 'stat-val' }, formatInt(r.newCount)), h('div', { class: 'stat-lbl' }, 'کالای جدید')),
      h('div', { class: 'stat sm' }, h('div', { class: 'stat-val' }, formatInt(r.updateCount)), h('div', { class: 'stat-lbl' }, 'به‌روزرسانی')),
      h('div', { class: 'stat sm' }, h('div', { class: 'stat-val' }, formatInt(r.errors.length)), h('div', { class: 'stat-lbl' }, 'خطا')));
    const body = h('div', {}, h('p', { class: 'muted' }, `فایل: ${file.name}`), sum(res), warnList, errList);
    const ok = btn(`ثبت نهایی ${formatInt(res.valid.length)} کالا`, { cls: 'primary', ic: 'upload', onClick: async () => {
      await repo.putProducts(res.valid.map(({ code, name, perCarton }) => ({ code, name, perCarton })));
      await refreshProducts(); draw();
      body.replaceChildren(h('p', { class: 'ok-msg' }, 'ورود کالاها انجام شد.'), sum(res), warnList, errList);
      ok.remove(); m.box.querySelector('.modal-foot button:last-child').textContent = 'بستن';
      toast(`${formatInt(res.newCount)} کالای جدید و ${formatInt(res.updateCount)} به‌روزرسانی ثبت شد.`);
    } });
    if (!res.valid.length) ok.setAttribute('disabled', '');
    const m = modal({ title: 'پیش‌نمایش ورود از Excel', wide: true, body, actions: [ok, btn('انصراف', { onClick: () => m.close() })] });
  }
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) importFile(fileIn.files[0]); fileIn.value = ''; });

  view.replaceChildren(
    h('div', { class: 'page-head' }, h('h2', {}, 'بانک کالا'), btn('افزودن کالا', { cls: 'primary', ic: 'plus', onClick: () => edit(null) })),
    h('div', { class: 'toolbar' }, search,
      btn('ورود از Excel', { ic: 'upload', onClick: () => fileIn.click() }),
      btn('فایل نمونه', { ic: 'download', onClick: downloadSample }),
      btn('خروجی Excel', { ic: 'download', onClick: () => products.length ? exportProducts(products) : toast('بانک کالا خالی است.', 'err') }), count, fileIn),
    h('section', { class: 'card flush' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'کد کالا'), h('th', {}, 'شرح کالا'), h('th', {}, 'تعداد در کارتن'), h('th', {}, ''))), tbody))),
    pager,
    h('p', { class: 'muted small' }, 'فرمت فایل Excel: ستون اول کد کالا، ستون دوم شرح کالا، ستون سوم تعداد قوطی در کارتن (شیت اول؛ ردیف عنوان اختیاری). قیمت در بانک ذخیره نمی‌شود.'),
  );
  draw();
}
