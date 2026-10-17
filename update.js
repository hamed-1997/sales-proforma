// به‌روزرسانی برنامه: وقتی فایل‌ها در GitHub عوض شدند، با یک کلیک نسخه‌ی جدید گرفته می‌شود.
// داده‌های کاربر (IndexedDB) هیچ‌وقت دست‌نخورده می‌ماند؛ فقط فایل‌های برنامه تازه می‌شوند.
import { toast, confirmBox } from './ui.js';

export const APP_VERSION = '2.0.0';
let guardFn = () => false;
export const setUpdateGuard = fn => { guardFn = fn; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function askSW(sw, msg, timeout = 60000) {
  return new Promise((res, rej) => {
    const ch = new MessageChannel(), t = setTimeout(() => rej(new Error('timeout')), timeout);
    ch.port1.onmessage = e => { clearTimeout(t); res(e.data); };
    sw.postMessage(msg, [ch.port2]);
  });
}

export async function checkForUpdate() {
  if (!navigator.onLine) return { status: 'offline' };
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return { status: 'unsupported' };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { status: 'unsupported' };
  await reg.update().catch(() => {});                 // اگر sw.js جدید باشد، نصب می‌شود
  const worker = reg.installing || reg.waiting;
  if (worker) {
    await new Promise(res => {
      if (worker.state === 'activated') return res();
      worker.addEventListener('statechange', () => { if (worker.state === 'activated') res(); });
      setTimeout(res, 20000);
    });
    return { status: 'updated' };
  }
  if (!reg.active) return { status: 'unsupported' };
  const r = await askSW(reg.active, { type: 'REFRESH' }); // فایل‌ها را بدون کش مرورگر دوباره می‌گیرد و مقایسه می‌کند
  if (r.changed > 0) return { status: 'updated', changed: r.changed };
  return r.checked ? { status: 'current' } : { status: 'error' };
}

export async function runUpdate(btnEl) {
  if (btnEl?.dataset.busy) return;
  if (btnEl) { btnEl.dataset.busy = '1'; btnEl.classList.add('spin'); }
  try {
    toast('در حال بررسی نسخه‌ی جدید…');
    const r = await checkForUpdate();
    if (r.status === 'updated') {
      toast('نسخه‌ی جدید دریافت شد؛ برنامه دوباره بارگذاری می‌شود.');
      await sleep(1300);
      if (guardFn() && !await confirmBox({ title: 'تغییرات ذخیره‌نشده', message: 'نسخه‌ی جدید آماده است، ولی این صفحه تغییرات ذخیره‌نشده دارد. بعد از ذخیره، صفحه را دوباره بارگذاری کنید (Ctrl+F5).', okText: 'اکنون بارگذاری شود', danger: true })) return;
      location.reload();
    } else if (r.status === 'current') toast('برنامه به‌روز است.');
    else if (r.status === 'offline') toast('برای به‌روزرسانی به اینترنت نیاز است.', 'err');
    else if (r.status === 'unsupported') toast('به‌روزرسانی فقط در نسخه‌ی منتشرشده روی وب (http/https) کار می‌کند.', 'err');
    else toast('بررسی به‌روزرسانی ناموفق بود. اتصال را بررسی کنید.', 'err');
  } catch { toast('بررسی به‌روزرسانی ناموفق بود.', 'err'); }
  finally { if (btnEl) { delete btnEl.dataset.busy; btnEl.classList.remove('spin'); } }
}
