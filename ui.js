// ماژول ui — ابزارهای رابط کاربری: ساخت عنصر، پیام، گفتگو، تقویم شمسی
import { toFaDigits, toEnDigits } from './format.js';
import * as J from './jalali.js';

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export function icon(name) {
  const paths = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    plus: 'M12 5v14M5 12h14',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    box: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
    gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
    edit: 'M4 20h4l10-10-4-4L4 16v4zM13 7l4 4',
    print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
    eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    save: 'M5 3h11l4 4v14H5zM8 3v5h7V3M8 21v-7h8v7',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    x: 'M6 6l12 12M18 6L6 18',
  };
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', paths[name] || ''); s.append(p);
  return s;
}

export function btn(label, { cls = '', ic = '', onClick, type = 'button', title } = {}) {
  return h('button', { type, class: `btn ${cls}`, onClick, title }, ic ? icon(ic) : null, label ? h('span', {}, label) : null);
}

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), kind === 'err' ? 6000 : 3000);
  setTimeout(() => t.remove(), kind === 'err' ? 6400 : 3400);
}

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const prevFocus = document.activeElement;
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); onClose?.(v); };
  const onKey = e => { if (e.key === 'Escape' && !document.querySelector('.cal-pop') && !document.querySelector('.menu:not([hidden])')) { e.stopPropagation(); close(); } };
  box.append(
    h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'بستن', onClick: () => close() }, icon('x'))),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions) : null,
  );
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  (box.querySelector('[autofocus]') || box.querySelector('input,select,textarea,button.primary') || box).focus?.();
  return { close, box };
}

export function confirmBox({ title = 'تأیید', message, okText = 'تأیید', danger = false }) {
  return new Promise(resolve => {
    let m;
    const ok = btn(okText, { cls: danger ? 'danger' : 'primary', onClick: () => { resolve(true); m.close(); } });
    const no = btn('انصراف', { onClick: () => { resolve(false); m.close(); } });
    m = modal({ title, body: h('p', { class: 'confirm-msg' }, message), actions: [ok, no], onClose: v => { if (v === undefined) resolve(false); } });
    no.focus();
  });
}

export function promptBox({ title, label, value = '', okText = 'ثبت' }) {
  return new Promise(resolve => {
    let m, settled = false;
    const finish = v => { if (!settled) { settled = true; resolve(v); } };
    const inp = h('input', { type: 'text', value, autofocus: true, class: 'input' });
    const go = () => { const v = inp.value.trim(); if (!v) { inp.classList.add('err'); return; } finish(v); m.close(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    m = modal({ title, body: h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), inp), actions: [btn(okText, { cls: 'primary', onClick: go }), btn('انصراف', { onClick: () => { finish(null); m.close(); } })], onClose: () => finish(null) });
  });
}

/** فیلد با برچسب و پیام خطا زیر آن */
export function field(label, control, { hint, cls = '' } = {}) {
  const err = h('div', { class: 'ferr', role: 'alert' });
  const wrap = h('label', { class: `field ${cls}` }, h('span', { class: 'lbl' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null, err);
  wrap.setError = msg => { err.textContent = msg || ''; control.classList?.toggle('err', !!msg); control.setAttribute?.('aria-invalid', msg ? 'true' : 'false'); };
  return wrap;
}

export function download(filename, blobOrText, type = 'application/json') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** تقویم شمسی: دکمه‌ی کنار ورودی تاریخ؛ مقدار با ارقام لاتین YYYY/MM/DD نوشته می‌شود */
export function attachDatePicker(input) {
  const wrap = h('span', { class: 'date-wrap' });
  input.replaceWith(wrap);
  const b = h('button', { type: 'button', class: 'icon-btn cal-btn', 'aria-label': 'انتخاب تاریخ', title: 'تقویم' }, icon('cal'));
  wrap.append(input, b);
  let pop = null;
  const closePop = () => { pop?.remove(); pop = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', keyClose, true); };
  const outside = e => { if (pop && !pop.contains(e.target) && e.target !== b && !b.contains(e.target)) closePop(); };
  const keyClose = e => { if (e.key === 'Escape') { e.stopPropagation(); closePop(); input.focus(); } };
  b.addEventListener('click', () => {
    if (pop) return closePop();
    const cur = J.parse(input.value);
    const t = J.parse(J.today());
    let vy = cur.ok ? cur.jy : t.jy, vm = cur.ok ? cur.jm : t.jm;
    pop = h('div', { class: 'cal-pop', role: 'dialog', 'aria-label': 'تقویم شمسی' });
    const draw = () => {
      pop.replaceChildren();
      const sel = J.parse(input.value);
      const head = h('div', { class: 'cal-head' },
        h('button', { type: 'button', class: 'icon-btn', onClick: () => { vm++; if (vm > 12) { vm = 1; vy++; } draw(); }, 'aria-label': 'ماه بعد' }, '‹'),
        h('strong', {}, `${J.MONTHS[vm - 1]} ${toFaDigits(vy)}`),
        h('button', { type: 'button', class: 'icon-btn', onClick: () => { vm--; if (vm < 1) { vm = 12; vy--; } draw(); }, 'aria-label': 'ماه قبل' }, '›'),
      );
      const grid = h('div', { class: 'cal-grid' }, J.WEEKDAYS.map(w => h('span', { class: 'cal-wd' }, w)));
      const first = J.weekday(vy, vm, 1);
      for (let i = 0; i < first; i++) grid.append(h('span'));
      for (let d = 1; d <= J.monthLength(vy, vm); d++) {
        const isSel = sel.ok && sel.jy === vy && sel.jm === vm && sel.jd === d;
        const isToday = t.jy === vy && t.jm === vm && t.jd === d;
        grid.append(h('button', {
          type: 'button', class: `cal-day${isSel ? ' sel' : ''}${isToday ? ' today' : ''}`,
          onClick: () => { input.value = J.fmt(vy, vm, d); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); closePop(); input.focus(); },
        }, toFaDigits(d)));
      }
      const foot = h('div', { class: 'cal-foot' }, h('button', { type: 'button', class: 'btn sm', onClick: () => { vy = t.jy; vm = t.jm; input.value = J.today(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); closePop(); } }, 'امروز'));
      pop.append(head, grid, foot);
    };
    draw();
    document.body.append(pop);
    const r = b.getBoundingClientRect();
    const pw = 272;
    pop.style.top = Math.min(window.innerHeight - 330, r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.right - pw)) + 'px';
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', keyClose, true);
  });
  return wrap;
}

/** دکمه‌ی منوی کشویی: items = [{label, ic, onClick}] */
export function menuButton(label, items, { ic = '', up = false, cls = '' } = {}) {
  const list = h('ul', { class: `menu${up ? ' up' : ''}`, role: 'menu', hidden: true });
  const trigger = h('button', { type: 'button', class: `btn ${cls}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, ic ? icon(ic) : null, h('span', {}, label), h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  const wrap = h('span', { class: 'menu-wrap' }, trigger, list);
  const outside = e => { if (!wrap.contains(e.target)) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); trigger.focus(); } };
  function close() { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); }
  items.forEach(it => list.append(h('li', { role: 'none' }, h('button', { type: 'button', role: 'menuitem', class: 'menu-item', onClick: () => { close(); it.onClick(); } }, it.ic ? icon(it.ic) : null, h('span', {}, it.label)))));
  trigger.addEventListener('click', () => {
    if (!list.hidden) return close();
    list.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', onKey, true);
    list.querySelector('button')?.focus();
  });
  list.addEventListener('keydown', e => {
    const bs = [...list.querySelectorAll('button')], i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
  });
  return wrap;
}

export { toEnDigits };
