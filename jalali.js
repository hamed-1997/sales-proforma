// ماژول jalali — تبدیل و اعتبارسنجی تاریخ شمسی (الگوریتم جلالی استاندارد)
import { toEnDigits } from './format.js';

const div = (a, b) => ~~(a / b);
const mod = (a, b) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy, withoutLeap) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14, jp = BREAKS[0], jm, jump = 0, leap, n;
  if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('سال نامعتبر');
  for (let i = 1; i < bl; i++) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (withoutLeap) return { gy, march };
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}
function g2d(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}
function d2g(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}
function j2d(jy, jm, jd) {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}
function d2j(jdn) {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f, jm, jd;
  if (k >= 0) {
    if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy, jm, jd }; }
    k -= 186;
  } else {
    jy -= 1; k += 179;
    if (r.leap === 1) k += 1;
  }
  jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
  return { jy, jm, jd };
}

export const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
export const WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export const isLeap = jy => jalCal(jy, false).leap === 0;
export function monthLength(jy, jm) { return jm <= 6 ? 31 : jm <= 11 ? 30 : (isLeap(jy) ? 30 : 29); }
export function isValid(jy, jm, jd) {
  return Number.isInteger(jy) && Number.isInteger(jm) && Number.isInteger(jd) &&
    jy >= 1300 && jy <= 1700 && jm >= 1 && jm <= 12 && jd >= 1 && jd <= monthLength(jy, jm);
}
export const toJalali = (gy, gm, gd) => d2j(g2d(gy, gm, gd));
export const toGregorian = (jy, jm, jd) => d2g(j2d(jy, jm, jd));
/** روز هفته: ۰ = شنبه … ۶ = جمعه */
export function weekday(jy, jm, jd) {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return (new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay() + 1) % 7;
}
const p2 = n => String(n).padStart(2, '0');
export const fmt = (jy, jm, jd) => `${jy}/${p2(jm)}/${p2(jd)}`;
export function today() {
  const d = new Date();
  const j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return fmt(j.jy, j.jm, j.jd);
}
/** تجزیه‌ی YYYY/MM/DD؛ خروجی {ok, jy, jm, jd, text, error} */
export function parse(raw) {
  const t = toEnDigits(raw).trim().replace(/[-.]/g, '/');
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (!m) return { ok: false, error: 'تاریخ را به‌صورت ۱۴۰۵/۰۷/۲۲ وارد کنید.' };
  const [jy, jm, jd] = [+m[1], +m[2], +m[3]];
  if (!isValid(jy, jm, jd)) return { ok: false, error: 'تاریخ شمسی نامعتبر است (ماه ۱–۱۲، روز مطابق طول ماه).' };
  return { ok: true, jy, jm, jd, text: fmt(jy, jm, jd) };
}
