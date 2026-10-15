// ماژول db — ذخیره‌سازی در IndexedDB.
// نکته‌ی معماری: همه‌ی صفحات فقط از شیء `repo` استفاده می‌کنند؛ برای اتصال به API و دیتابیس مرکزی
// کافی است پیاده‌سازی همین متدها جایگزین شود.
// هشدار: داده‌ها فقط روی همین دستگاه/مرورگر ذخیره می‌شوند و بین دستگاه‌ها همگام نمی‌شوند.
const DB_NAME = 'sales-proforma';
const DB_VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('این مرورگر از IndexedDB پشتیبانی نمی‌کند.'));
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      db.createObjectStore('products', { keyPath: 'code' });
      const inv = db.createObjectStore('invoices', { keyPath: 'id' });
      inv.createIndex('number', 'number', { unique: true });
      inv.createIndex('date', 'date');
      db.createObjectStore('settings', { keyPath: 'key' });
      db.createObjectStore('templates', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    rq.onsuccess = () => {
      const db = rq.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    rq.onerror = () => reject(rq.error || new Error('باز کردن پایگاه داده ناموفق بود.'));
    rq.onblocked = () => reject(new Error('پایگاه داده توسط تب دیگری قفل شده است؛ سایر تب‌ها را ببندید.'));
  });
  return dbp;
}
const prom = rq => new Promise((res, rej) => { rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('تراکنش لغو شد.')); });

async function tx(stores, mode = 'readonly') { const db = await open(); return db.transaction(stores, mode); }

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

export const repo = {
  async init() { await open(); },

  // ---- کلی ----
  async getAll(store) { const t = await tx(store); return prom(t.objectStore(store).getAll()); },
  async get(store, key) { const t = await tx(store); return prom(t.objectStore(store).get(key)); },
  async put(store, val) { const t = await tx(store, 'readwrite'); t.objectStore(store).put(val); await done(t); return val; },
  async del(store, key) { const t = await tx(store, 'readwrite'); t.objectStore(store).delete(key); await done(t); },
  async count(store) { const t = await tx(store); return prom(t.objectStore(store).count()); },

  // ---- کالاها ----
  async putProducts(list) {
    const t = await tx('products', 'readwrite'); const s = t.objectStore('products');
    list.forEach(p => s.put(p)); await done(t);
  },

  // ---- تنظیمات ----
  async getSetting(key, fallback) { const r = await this.get('settings', key); return r ? r.value : fallback; },
  async setSetting(key, value) { return this.put('settings', { key, value }); },

  /**
   * ذخیره‌ی پیش‌فاکتور. شماره‌ی جدید در همان تراکنش خواندن/نوشتن (readwrite روی meta و invoices) گرفته می‌شود؛
   * IndexedDB تراکنش‌های هم‌پوشان را (حتی بین چند تب) پشت‌سرهم اجرا می‌کند، پس شماره‌ها تکراری نمی‌شوند.
   */
  async saveInvoice(inv, startNumber = 1) {
    const t = await tx(['invoices', 'meta'], 'readwrite');
    const invS = t.objectStore('invoices'), metaS = t.objectStore('meta');
    const now = new Date().toISOString();
    if (!inv.id) {
      const counter = (await prom(metaS.get('invoiceCounter')))?.value ?? 0;
      let n = Math.max(counter + 1, startNumber);
      // پیشگیری از برخورد با شماره‌ی موجود (مثلاً پس از بازیابی پشتیبان)
      const idx = invS.index('number');
      while (await prom(idx.getKey(n)) !== undefined) n++;
      inv = { ...inv, id: uid(), number: n, createdAt: now };
      metaS.put({ key: 'invoiceCounter', value: n });
    }
    inv.updatedAt = now;
    invS.put(inv);
    await done(t);
    return inv;
  },

  // ---- پشتیبان ----
  async exportAll() {
    const out = { app: 'sales-proforma', version: 1, exportedAt: new Date().toISOString() };
    for (const s of ['products', 'invoices', 'settings', 'templates', 'meta']) out[s] = await this.getAll(s);
    return out;
  },
  async importAll(data) {
    if (!data || data.app !== 'sales-proforma') throw new Error('فایل پشتیبان معتبر نیست.');
    const stores = ['products', 'invoices', 'settings', 'templates', 'meta'];
    const t = await tx(stores, 'readwrite');
    for (const s of stores) {
      const os = t.objectStore(s); os.clear();
      (data[s] || []).forEach(v => os.put(v));
    }
    await done(t);
  },
};
