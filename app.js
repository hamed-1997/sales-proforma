// نقطه‌ی ورود: پوسته‌ی برنامه، مسیریابی و ثبت Service Worker
import { repo } from './db.js';
import * as S from './settings.js';
import { h, icon, confirmBox, btn, toast } from './ui.js';

const ROUTES = {
  dashboard: { title: 'داشبورد', ic: 'home', load: () => import('./page-dashboard.js') },
  invoice: { title: 'پیش‌فاکتور جدید', ic: 'plus', load: () => import('./page-invoice.js') },
  invoices: { title: 'پیش‌فاکتورها', ic: 'list', load: () => import('./page-invoices.js') },
  products: { title: 'بانک کالا', ic: 'box', load: () => import('./page-products.js') },
  settings: { title: 'تنظیمات', ic: 'gear', load: () => import('./page-settings.js') },
};
const NAV = [['dashboard', '#/dashboard'], ['invoice', '#/invoice'], ['invoices', '#/invoices'], ['products', '#/products'], ['settings', '#/settings']];

const app = document.getElementById('app');
let view, companyEl, pageTitleEl, navEl, currentHash = null, guard = null, leaveFns = [], routeSeq = 0, deferredInstall = null;

function parseHash(hash) {
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const [name, param] = path.split('/');
  return { name: ROUTES[name] ? name : 'dashboard', param: param ? decodeURIComponent(param) : '', query: new URLSearchParams(qs) };
}

function shell() {
  companyEl = h('div', { class: 'company' });
  pageTitleEl = h('h1', { class: 'page-title' });
  const online = h('span', { class: 'net', role: 'status' });
  const setNet = () => { online.textContent = navigator.onLine ? 'آنلاین' : 'آفلاین — برنامه بدون اینترنت کار می‌کند'; online.classList.toggle('off', !navigator.onLine); };
  window.addEventListener('online', setNet); window.addEventListener('offline', setNet); setNet();
  // دکمه‌ی نصب: فقط وقتی برنامه نصب نیست؛ بعد از نصب (یا اجرا در حالت برنامه‌ی نصب‌شده) دیگر نمایش داده نمی‌شود
  const FLAG = 'proforma-installed';
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const wasInstalled = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
  const markInstalled = () => { try { localStorage.setItem(FLAG, '1'); } catch { /* نادیده */ } };
  if (standalone()) markInstalled();
  const install = btn('نصب برنامه', { cls: 'sm', ic: 'download', onClick: async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    const { outcome } = await deferredInstall.userChoice;
    deferredInstall = null; install.hidden = true;
    if (outcome === 'accepted') markInstalled();
  } });
  install.hidden = true;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); if (standalone() || wasInstalled()) return; deferredInstall = e; install.hidden = false; });
  window.addEventListener('appinstalled', () => { markInstalled(); deferredInstall = null; install.hidden = true; toast('برنامه نصب شد.'); });
  navEl = h('nav', { class: 'nav', 'aria-label': 'ناوبری اصلی' }, NAV.map(([name, href]) =>
    h('a', { href, dataset: { route: name }, class: 'nav-item' }, icon(ROUTES[name].ic), h('span', {}, ROUTES[name].title))));
  view = h('main', { id: 'view', tabindex: -1 });
  app.replaceChildren(
    h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('div', { class: 'logo', 'aria-hidden': 'true' }, 'پ'), h('div', {}, h('div', { class: 'brand-t' }, 'پیش‌فاکتور فروش'), h('div', { class: 'brand-s', dir: 'ltr' }, 'Sales Proforma'))), navEl),
    h('div', { class: 'main-col' }, h('header', { class: 'topbar' }, h('div', { class: 'tb-r' }, companyEl, pageTitleEl), h('div', { class: 'tb-l' }, install, online)), view));
  refreshShell();
}
export function refreshShell() { companyEl.textContent = S.state.general.companyName || 'نام شرکت ثبت نشده'; companyEl.classList.toggle('muted', !S.state.general.companyName); }

async function route() {
  const hash = location.hash || '#/dashboard';
  if (currentHash !== null && hash !== currentHash && guard && guard()) {
    history.replaceState(null, '', currentHash);
    if (!await confirmBox({ title: 'تغییرات ذخیره‌نشده', message: 'تغییرات این صفحه ذخیره نشده است. صفحه را ترک می‌کنید؟', okText: 'ترک صفحه', danger: true })) return;
    history.replaceState(null, '', hash);
  }
  currentHash = hash;
  await renderCurrent();
}

async function renderCurrent() {
  const seq = ++routeSeq;
  leaveFns.forEach(f => { try { f(); } catch { /* نادیده */ } }); leaveFns = []; guard = null;
  const r = parseHash(location.hash || '#/dashboard');
  const def = ROUTES[r.name];
  pageTitleEl.textContent = def.title;
  navEl.querySelectorAll('.nav-item').forEach(a => { const on = a.dataset.route === r.name; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  const ctx = {
    param: r.param, query: r.query,
    go: hash => { if (location.hash === hash) renderCurrent(); else location.hash = hash; },
    rerender: () => renderCurrent(), refreshShell,
    setLeaveGuard: fn => { guard = fn; }, onLeave: fn => leaveFns.push(fn),
  };
  try {
    view.replaceChildren(h('div', { class: 'loading' }, 'در حال بارگذاری…'));
    const mod = await def.load();
    if (seq !== routeSeq) return;
    await mod.render(view, ctx);
    if (seq === routeSeq) { window.scrollTo(0, 0); }
  } catch (e) {
    console.error(e);
    view.replaceChildren(h('div', { class: 'card' }, h('h3', {}, 'خطا در نمایش صفحه'), h('p', {}, e.message || String(e))));
  }
}

window.addEventListener('beforeunload', e => { if (guard && guard()) { e.preventDefault(); e.returnValue = ''; } });

async function boot() {
  try {
    await repo.init();
    await S.load();
  } catch (e) {
    app.replaceChildren(h('div', { class: 'fatal' }, h('h2', {}, 'ذخیره‌سازی در دسترس نیست'), h('p', {}, e.message), h('p', { class: 'muted' }, 'اگر در حالت ناشناس (Private) هستید، برنامه را در پنجره‌ی عادی باز کنید.')));
    return;
  }
  shell();
  window.addEventListener('hashchange', route);
  if (!location.hash) history.replaceState(null, '', '#/dashboard');
  currentHash = location.hash;
  await renderCurrent();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
}
boot();
