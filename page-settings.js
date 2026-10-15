import { repo } from './db.js';
import { formatInt } from './format.js';
import * as J from './jalali.js';
import * as S from './settings.js';
import { buildDocument } from './print.js';
import { h, btn, icon, field, toast, confirmBox, promptBox, download } from './ui.js';
import { mountPreview } from './page-common.js';
import { refreshProducts } from './page-common.js';

const SAMPLE = () => {
  const mk = (code, name, cans, per, fee, d = 800, t = 1000) => {
    const gross = cans * fee, discount = Math.round(gross * d / 10000), net = gross - discount, tax = Math.round(net * t / 10000);
    return { code, name, cartons: Math.round(cans * 100 / per) / 100, cans, fee, gross, discount, net, tax, final: net + tax };
  };
  const rows = [mk('5199', 'نمونه شرح کالا — بسته‌ی ۱۲ عددی', 240, 12, 145000), mk('5203', 'شرح کالای نمونه شماره دو', 125, 24, 98500), mk('6012', 'کالای نمونه با شرح طولانی‌تر برای بررسی شکستن خط در ستون شرح', 600, 6, 312000)];
  const t = rows.reduce((a, r) => ({ cartons: a.cartons + r.cartons, cans: a.cans + r.cans, gross: a.gross + r.gross, discount: a.discount + r.discount, net: a.net + r.net, tax: a.tax + r.tax, final: a.final + r.final }), { cartons: 0, cans: 0, gross: 0, discount: 0, net: 0, tax: 0, final: 0 });
  return { sellerName: S.state.general.companyName || 'شرکت نمونه', line: '1', date: J.today(), buyerName: 'خریدار نمونه', buyerCode: '1024', rows, totals: t, currency: S.state.general.currency };
};

export async function render(view, ctx) {
  let tab = ctx.query.get('tab') || 'general';
  const tabs = [['general', 'عمومی'], ['print', 'تنظیمات چاپ'], ['backup', 'پشتیبان‌گیری']];
  const body = h('div');
  const bar = h('div', { class: 'tabs', role: 'tablist' });
  const drawTabs = () => bar.replaceChildren(...tabs.map(([id, l]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onClick: () => { tab = id; drawTabs(); draw(); } }, l)));
  function draw() { body.replaceChildren(); (tab === 'general' ? general : tab === 'print' ? printTab : backup)(body); }
  view.replaceChildren(h('div', { class: 'page-head' }, h('h2', {}, 'تنظیمات')), bar, body);
  drawTabs(); draw();

  // ---------------- عمومی ----------------
  function general(root) {
    const G = S.state.general;
    const inp = (k, o = {}) => h('input', { class: 'input', value: G[k], ...o });
    const company = inp('companyName'), taxMax = inp('taxMaxPct', { dir: 'ltr', inputmode: 'decimal' }), start = inp('startNumber', { dir: 'ltr', inputmode: 'numeric' });
    const dd = inp('defaultDiscountPct', { dir: 'ltr', inputmode: 'decimal' }), dt = inp('defaultTaxPct', { dir: 'ltr', inputmode: 'decimal' });
    const currency = inp('currency');
    const round = h('select', { class: 'input' }, [['half-up', 'گرد معمولی (نیم به بالا)'], ['floor', 'حذف اعشار (کف)'], ['banker', 'گرد بانکی']].map(([v, l]) => h('option', { value: v, selected: G.rounding === v }, l)));
    const theme = h('select', { class: 'input' }, [['light', 'روشن'], ['dark', 'تیره']].map(([v, l]) => h('option', { value: v, selected: G.theme === v }, l)));
    const dec = h('input', { type: 'checkbox', checked: G.allowDecimalFee });
    const fs = { company: field('نام شرکت (فروشنده)', company), taxMax: field('سقف مجاز درصد مالیات', taxMax), start: field('شماره‌ی شروع پیش‌فاکتور', start, { hint: 'شماره‌ها پشت‌سرهم و بدون تکرار داده می‌شوند.' }), dd: field('درصد تخفیف کلی پیش‌فرض', dd), dt: field('درصد مالیات کلی پیش‌فرض', dt), currency: field('واحد پول', currency), round: field('روش گردکردن', round, { hint: 'برای تطبیق با سامانه‌ی فعلی خود انتخاب کنید.' }), theme: field('پوسته', theme) };
    const save = async () => {
      const { parsePercentBP } = await import('./calc.js');
      const { parseUInt } = await import('./format.js');
      let ok = true;
      const tm = parsePercentBP(taxMax.value, 1000000); if (!tm.ok) { fs.taxMax.setError(tm.error || 'عدد نامعتبر است.'); ok = false; } else fs.taxMax.setError('');
      const sn = parseUInt(start.value); if (!sn.ok || sn.value < 1) { fs.start.setError('عدد صحیح بزرگ‌تر از صفر وارد کنید.'); ok = false; } else fs.start.setError('');
      const d1 = parsePercentBP(dd.value, 10000); if (!d1.ok) { fs.dd.setError(d1.error || 'الزامی است.'); ok = false; } else fs.dd.setError('');
      const t1 = parsePercentBP(dt.value, tm.ok ? tm.bp : 10000); if (!t1.ok) { fs.dt.setError(t1.error || 'الزامی است.'); ok = false; } else fs.dt.setError('');
      if (!currency.value.trim()) { fs.currency.setError('الزامی است.'); ok = false; } else fs.currency.setError('');
      if (!ok) return;
      Object.assign(G, { companyName: company.value.trim(), taxMaxPct: tm.bp / 100, startNumber: sn.value, defaultDiscountPct: String(d1.bp / 100), defaultTaxPct: String(t1.bp / 100), currency: currency.value.trim(), rounding: round.value, theme: theme.value, allowDecimalFee: dec.checked });
      await S.saveGeneral(); ctx.refreshShell(); toast('تنظیمات ذخیره شد.');
    };
    root.append(h('section', { class: 'card' }, h('div', { class: 'form-grid' }, Object.values(fs),
      h('label', { class: 'field check' }, dec, h('span', {}, 'اجازه‌ی فی اعشاری (حداکثر ۲ رقم)'))),
      h('div', { class: 'actions' }, btn('ذخیره‌ی تنظیمات', { cls: 'primary', ic: 'save', onClick: save }))));
  }

  // ---------------- پشتیبان ----------------
  function backup(root) {
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = ''; if (!f) return;
      let data; try { data = JSON.parse(await f.text()); } catch { return toast('فایل JSON معتبر نیست.', 'err'); }
      if (data?.app !== 'sales-proforma') return toast('این فایل پشتیبان این برنامه نیست.', 'err');
      if (!await confirmBox({ title: 'بازیابی پشتیبان', message: `همه‌ی داده‌های فعلی (کالاها، پیش‌فاکتورها و تنظیمات) با محتوای فایل جایگزین می‌شود: ${formatInt((data.invoices || []).length)} پیش‌فاکتور و ${formatInt((data.products || []).length)} کالا. ادامه می‌دهید؟`, okText: 'بازیابی', danger: true })) return;
      try { await repo.importAll(data); await S.load(); await refreshProducts(); ctx.refreshShell(); toast('بازیابی انجام شد.'); } catch (e) { toast('بازیابی ناموفق بود: ' + e.message, 'err'); }
    });
    root.append(h('section', { class: 'card' },
      h('p', {}, 'همه‌ی داده‌ها فقط روی همین دستگاه و مرورگر ذخیره می‌شوند و بین دستگاه‌ها همگام نمی‌شوند. برای جابه‌جایی یا نگهداری، از پشتیبان کامل (JSON) استفاده کنید.'),
      h('div', { class: 'actions' },
        btn('دانلود پشتیبان کامل', { cls: 'primary', ic: 'download', onClick: async () => { download(`proforma-backup-${J.today().replace(/\//g, '')}.json`, JSON.stringify(await repo.exportAll())); toast('پشتیبان دانلود شد.'); } }),
        btn('بازیابی از فایل', { ic: 'upload', onClick: () => file.click() }), file)));
  }

  // ---------------- چاپ ----------------
  async function printTab(root) {
    const invs = await repo.getAll('invoices');
    const last = invs.sort((a, b) => b.number - a.number)[0];
    let useSample = !last;
    let tpl = S.activeTemplate();
    const pvBox = h('div', { class: 'pv-box' });
    const pv = mountPreview(pvBox);
    ctx.onLeave(() => pv.destroy());
    let tSave = null, tPv = null;
    const model = () => useSample ? SAMPLE() : { ...last, currency: last.currency || S.state.general.currency };
    const refresh = () => { clearTimeout(tPv); tPv = setTimeout(() => pv.update(buildDocument(model(), tpl.config, { preview: true }), tpl.config), 80); };
    const persist = () => { clearTimeout(tSave); tSave = setTimeout(() => S.saveTemplate(tpl), 300); };
    const changed = () => { refresh(); persist(); };
    ctx.onLeave(() => { clearTimeout(tSave); S.saveTemplate(tpl); });

    const form = h('div', { class: 'pset' });
    const C = () => tpl.config;
    const num = (get, set, { min = 0, max = 999, step = 0.5, w = 74 } = {}) => {
      const i = h('input', { class: 'input mini', type: 'number', min, max, step, value: get(), style: { width: w + 'px' }, dir: 'ltr' });
      i.addEventListener('input', () => { const v = Number(i.value); const ok = i.value !== '' && Number.isFinite(v) && v >= min && v <= max; i.classList.toggle('err', !ok); if (ok) { set(v); changed(); } });
      return i;
    };
    const section = (title, content, resetFn) => h('details', { class: 'psec', open: true }, h('summary', {}, title),
      h('div', { class: 'psec-body' }, content, resetFn ? h('div', { class: 'reset-row' }, btn('بازگشت این بخش به پیش‌فاکتور', { cls: 'sm', onClick: () => { resetFn(); changed(); build(); } })) : null));
    const reset = (...keys) => () => keys.forEach(k => { C()[k] = S.clone(S.DEFAULT_PRINT[k]); });

    function build() {
      form.replaceChildren(
        templates(),
        section('فونت', h('div', { class: 'form-grid one' },
          field('فونت سند', fontSel(C().fontFamily, v => { C().fontFamily = v; changed(); })),
          field('فونت عنوان (اختیاری)', fontSel(C().titleFont, v => { C().titleFont = v; changed(); }, true))), reset('fontFamily', 'titleFont')),
        section('اندازه و ضخامت قلم هر بخش', h('div', { class: 'rows' }, S.FONT_SECTIONS.map(([k, l]) => h('div', { class: 'prow' }, h('span', {}, l),
          num(() => C().fonts[k].size, v => C().fonts[k].size = v, { min: 5, max: 40, step: 0.5 }), h('span', { class: 'u' }, 'pt'),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: C().fonts[k].bold, onChange: e => { C().fonts[k].bold = e.target.checked; changed(); } }), 'ضخیم')))), reset('fonts')),
        section('عرض ستون‌ها (٪)', colWidthsUI(), reset('colWidths')),
        section('ارتفاع سطرها (میلی‌متر)', h('div', { class: 'rows' }, S.HEIGHT_SECTIONS.map(([k, l]) => h('div', { class: 'prow' }, h('span', {}, l), num(() => C().heights[k], v => C().heights[k] = v, { min: 3, max: 60, step: 0.5 }), h('span', { class: 'u' }, 'mm'))),
          h('div', { class: 'prow' }, h('span', {}, 'فاصله‌ی داخلی سلول‌ها'), num(() => C().cellPadding, v => C().cellPadding = v, { min: 0, max: 10, step: 0.25 }), h('span', { class: 'u' }, 'mm'))), () => { reset('heights')(); C().cellPadding = S.DEFAULT_PRINT.cellPadding; }),
        section('صفحه و ظاهر چاپ', pageUI(), () => ['orientation', 'paper', 'margins', 'lineWidth', 'totalBoxPos', 'showBuyerCode', 'thousandSep', 'digits'].forEach(k => C()[k] = S.clone(S.DEFAULT_PRINT[k]))),
        h('div', { class: 'reset-all' }, btn('بازگشت همه‌ی تنظیمات این الگو به پیش‌فرض', { cls: 'danger-t', ic: 'trash', onClick: async () => { if (await confirmBox({ title: 'بازگشت به پیش‌فرض', message: 'همه‌ی تنظیمات چاپ این الگو به حالت اولیه برمی‌گردد.', okText: 'بازگشت', danger: true })) { tpl.config = S.clone(S.DEFAULT_PRINT); changed(); build(); } } }))
      );
    }
    const fontSel = (val, set, allowEmpty) => {
      const sel = h('select', { class: 'input' }, allowEmpty ? h('option', { value: '' }, 'همان فونت سند') : null, S.FONTS.map(f => h('option', { value: f.id, selected: val === f.id, dataset: { sys: f.system ? '1' : '' } }, f.label)));
      sel.addEventListener('change', () => set(sel.value));
      S.FONTS.filter(f => f.system).forEach(async f => { // فونت‌های B فقط اگر روی دستگاه نصب باشند کار می‌کنند
        if (!(await S.fontAvailable(f.id))) { const o = [...sel.options].find(x => x.value === f.id); if (o) o.textContent = f.label + ' — روی این دستگاه نصب نیست'; }
      });
      return sel;
    };
    const sel = (opts, val, set) => { const s = h('select', { class: 'input' }, opts.map(([v, l]) => h('option', { value: v, selected: String(val) === String(v) }, l))); s.addEventListener('change', () => set(s.value)); return s; };

    function colWidthsUI() {
      const sum = h('div', { class: 'wsum' }), inputs = [];
      const upd = () => { const s = Math.round(C().colWidths.reduce((a, b) => a + b, 0) * 10) / 10; sum.textContent = `مجموع: ${formatInt(s)}٪`; sum.classList.toggle('err', Math.abs(s - 100) > 0.05); sum.dataset.bad = Math.abs(s - 100) > 0.05 ? '1' : ''; return s; };
      const wrap = h('div', {}, h('div', { class: 'rows' }, S.COLS.map((l, i) => {
        const inp = num(() => C().colWidths[i], v => { C().colWidths[i] = v; upd(); }, { min: S.MIN_COL, max: 60, step: 0.5 });
        inputs.push(inp); return h('div', { class: 'prow' }, h('span', {}, l), inp, h('span', { class: 'u' }, '٪'));
      })), sum,
      h('div', { class: 'reset-row' }, btn('نرمال‌سازی خودکار', { cls: 'sm', onClick: () => { C().colWidths = S.normalizeWidths(C().colWidths); inputs.forEach((x, i) => { x.value = C().colWidths[i]; x.classList.remove('err'); }); upd(); changed(); } }),
        h('span', { class: 'muted small' }, `حداقل عرض هر ستون ${formatInt(S.MIN_COL)}٪ است.`)));
      const warn = h('div', { class: 'ferr' });
      const origUpd = upd;
      const wrapUpd = () => { const s = origUpd(); warn.textContent = Math.abs(s - 100) > 0.05 ? 'مجموع عرض ستون‌ها باید ۱۰۰٪ باشد؛ «نرمال‌سازی خودکار» را بزنید.' : ''; };
      wrap.append(warn); wrapUpd();
      inputs.forEach(i => i.addEventListener('input', wrapUpd));
      return wrap;
    }

    function pageUI() {
      const m = C().margins;
      const marg = (k, l) => h('div', { class: 'prow' }, h('span', {}, l), num(() => m[k], v => m[k] = v, { min: 0, max: 40, step: 1 }), h('span', { class: 'u' }, 'mm'));
      return h('div', { class: 'form-grid one' },
        field('جهت صفحه', sel([['landscape', 'افقی'], ['portrait', 'عمودی']], C().orientation, v => { C().orientation = v; changed(); })),
        field('اندازه‌ی کاغذ', sel([['A4', 'A4'], ['A5', 'A5'], ['Letter', 'Letter']], C().paper, v => { C().paper = v; changed(); })),
        h('div', { class: 'rows' }, marg('top', 'حاشیه‌ی بالا'), marg('right', 'حاشیه‌ی راست'), marg('bottom', 'حاشیه‌ی پایین'), marg('left', 'حاشیه‌ی چپ'),
          h('div', { class: 'prow' }, h('span', {}, 'ضخامت خطوط جدول'), num(() => C().lineWidth, v => C().lineWidth = v, { min: 0.5, max: 2, step: 0.25 }), h('span', { class: 'u' }, 'px'))),
        field('جایگاه «جمع مبلغ»', sel([['left', 'چپ'], ['center', 'وسط'], ['right', 'راست']], C().totalBoxPos, v => { C().totalBoxPos = v; changed(); })),
        field('جداکننده‌ی هزارگان', sel([[',', 'ویرگول انگلیسی ( , )'], ['٬', 'ویرگول فارسی ( ٬ )']], C().thousandSep, v => { C().thousandSep = v; changed(); })),
        field('نوع ارقام جدول', sel([['fa', 'فارسی'], ['en', 'لاتین']], C().digits, v => { C().digits = v; changed(); })),
        h('label', { class: 'field check' }, h('input', { type: 'checkbox', checked: C().showBuyerCode, onChange: e => { C().showBuyerCode = e.target.checked; changed(); } }), h('span', {}, 'نمایش کد خریدار در چاپ')));
    }

    function templates() {
      const s = h('select', { class: 'input', 'aria-label': 'الگوی فعال' }, S.state.templates.map(t => h('option', { value: t.id, selected: t.id === tpl.id }, t.name)));
      s.addEventListener('change', async () => { await S.saveTemplate(tpl); await S.setActive(s.value); tpl = S.activeTemplate(); changed(); build(); });
      const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
      file.addEventListener('change', async () => {
        const f = file.files[0]; file.value = ''; if (!f) return;
        try {
          const d = JSON.parse(await f.text());
          if (d?.kind !== 'proforma-print-template' || !d.config) throw new Error('فایل الگوی چاپ معتبر نیست.');
          const t = await S.addTemplate(d.name || 'الگوی واردشده', S.merge(S.DEFAULT_PRINT, d.config));
          await S.setActive(t.id); tpl = t; changed(); build(); toast('الگو وارد شد.');
        } catch (e) { toast(e.message || 'ورود الگو ناموفق بود.', 'err'); }
      });
      return h('div', { class: 'tpl-bar' }, field('الگوی چاپ فعال', s),
        h('div', { class: 'tpl-btns' },
          btn('الگوی جدید', { cls: 'sm', ic: 'plus', onClick: async () => { const n = await promptBox({ title: 'الگوی جدید', label: 'نام الگو', value: tpl.name + ' (کپی)' }); if (!n) return; await S.saveTemplate(tpl); const t = await S.addTemplate(n, tpl.config); await S.setActive(t.id); tpl = t; build(); toast('الگو ساخته شد.'); } }),
          btn('تغییر نام', { cls: 'sm', ic: 'edit', onClick: async () => { const n = await promptBox({ title: 'تغییر نام الگو', label: 'نام الگو', value: tpl.name }); if (!n) return; tpl.name = n; await S.saveTemplate(tpl); build(); } }),
          btn('حذف', { cls: 'sm danger-t', ic: 'trash', onClick: async () => { if (S.state.templates.length < 2) return toast('حداقل یک الگو باید باقی بماند.', 'err'); if (!await confirmBox({ title: 'حذف الگو', message: `الگوی «${tpl.name}» حذف شود؟`, okText: 'حذف', danger: true })) return; await S.removeTemplate(tpl.id); tpl = S.activeTemplate(); changed(); build(); } }),
          btn('خروجی JSON', { cls: 'sm', ic: 'download', onClick: () => download(`print-template-${tpl.name.replace(/\s+/g, '_')}.json`, JSON.stringify({ kind: 'proforma-print-template', name: tpl.name, config: tpl.config }, null, 2)) }),
          btn('ورود JSON', { cls: 'sm', ic: 'upload', onClick: () => file.click() }), file));
    }

    const src = h('select', { class: 'input', 'aria-label': 'داده‌ی پیش‌نمایش' }, h('option', { value: 'sample', selected: useSample }, 'داده‌ی نمونه'), last ? h('option', { value: 'last', selected: !useSample }, `آخرین پیش‌فاکتور (شماره ${formatInt(last.number)})`) : null);
    src.addEventListener('change', () => { useSample = src.value === 'sample'; refresh(); });
    root.append(h('div', { class: 'print-layout' }, h('div', { class: 'print-form' }, form), h('div', { class: 'print-pv' }, h('div', { class: 'pv-bar' }, h('strong', {}, 'پیش‌نمایش زنده'), src, h('span', { class: 'muted small' }, 'خط قرمز = مرز صفحه')), pvBox)));
    build(); refresh();
  }
}
