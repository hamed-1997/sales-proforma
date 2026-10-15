// ماژول calc — محاسبات مالی با عدد صحیح (BigInt)؛ بدون float، گردکردن فقط یک‌بار در انتهای هر مقدار.
import { parseUInt, parseDecimal2, cleanNumberText } from './format.js';

export const ROUNDING = { HALF_UP: 'half-up', FLOOR: 'floor', BANKER: 'banker' };

/** تقسیم عدد صحیح نامنفی num/den با روش گردکردن انتخابی (BigInt). */
export function divRound(num, den, mode = ROUNDING.HALF_UP) {
  num = BigInt(num); den = BigInt(den);
  const q = num / den, r = num % den;
  if (r === 0n) return q;
  if (mode === ROUNDING.FLOOR) return q;
  const twice = r * 2n;
  if (twice > den) return q + 1n;
  if (twice < den) return q;
  if (mode === ROUNDING.BANKER) return q % 2n === 0n ? q : q + 1n; // دقیقاً نیم
  return q + 1n; // نیم به بالا
}

/** درصد (حداکثر ۲ رقم اعشار) → نقطه‌ی پایه (۷٫۳۸٪ = ۷۳۸). */
export function parsePercentBP(raw, maxBP = 10000) {
  const t = cleanNumberText(raw);
  if (t === '') return { ok: false, empty: true };
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return { ok: false, error: 'درصد نامعتبر است (حداکثر ۲ رقم اعشار).' };
  const [i, f = ''] = t.split('.');
  const bp = Number(i) * 100 + Number((f + '00').slice(0, 2));
  if (bp > maxBP) return { ok: false, error: `درصد نباید بیشتر از ${maxBP / 100} باشد.` };
  return { ok: true, bp };
}

/** تعداد کارتن ×۱۰۰ (۲ رقم اعشار، نیم به بالا) */
export const cartonsX100 = (cans, perCarton) => Number(divRound(BigInt(cans) * 100n, BigInt(perCarton), ROUNDING.HALF_UP));

/** محاسبه‌ی یک ردیف. ورودی‌های عددی باید قبلاً اعتبارسنجی شده باشند. */
export function calcRow({ cans, fee, perCarton, discountBP, taxBP }, mode = ROUNDING.HALF_UP) {
  const feeX100 = BigInt(Math.round(fee * 100));
  const gross = divRound(BigInt(cans) * feeX100, 100n, mode);
  const discount = divRound(gross * BigInt(discountBP), 10000n, mode);
  const net = gross - discount;
  const tax = divRound(net * BigInt(taxBP), 10000n, mode);
  const final = net + tax;
  const cartonsX100 = divRound(BigInt(cans) * 100n, BigInt(perCarton), ROUNDING.HALF_UP);
  return {
    cartonsX100: Number(cartonsX100), cartons: Number(cartonsX100) / 100,
    gross: Number(gross), discount: Number(discount), net: Number(net), tax: Number(tax), final: Number(final),
  };
}

/**
 * اعتبارسنجی و محاسبه‌ی یک ردیف ورودی.
 * row: {code, product:{code,name,perCarton}|null, cans, fee, discountPct, taxPct}  (رشته‌های خام)
 * خروجی: {status:'empty'|'incomplete'|'invalid'|'ok', errors:{field:msg}, calc?}
 */
export function evaluateRow(row, globals, opts = {}) {
  const { taxMaxBP = 10000, allowDecimalFee = false } = opts;
  const errors = {};
  const blank = ['code', 'cans', 'fee', 'discountPct', 'taxPct'].every(k => String(row[k] ?? '').trim() === '');
  if (blank) return { status: 'empty', errors };

  if (String(row.code ?? '').trim() === '') errors.code = 'کد کالا را وارد کنید.';
  else if (!row.product) errors.code = 'کد نامعتبر';

  const c = parseUInt(row.cans);
  if (!c.ok) errors.cans = c.empty ? 'تعداد قوطی را وارد کنید.' : c.error;
  else if (c.value <= 0) errors.cans = 'تعداد باید بزرگ‌تر از صفر باشد.';

  const f = allowDecimalFee ? parseDecimal2(row.fee) : parseUInt(row.fee);
  if (!f.ok) errors.fee = f.empty ? 'فی را وارد کنید.' : f.error;

  let dBP = globals.discountBP, tBP = globals.taxBP;
  if (String(row.discountPct ?? '').trim() !== '') {
    const p = parsePercentBP(row.discountPct, 10000);
    if (!p.ok) errors.discountPct = p.error; else dBP = p.bp;
  }
  if (String(row.taxPct ?? '').trim() !== '') {
    const p = parsePercentBP(row.taxPct, taxMaxBP);
    if (!p.ok) errors.taxPct = p.error; else tBP = p.bp;
  }
  if (Object.keys(errors).length) {
    const hasValue = ['cans', 'fee'].some(k => String(row[k] ?? '').trim() !== '') || String(row.code ?? '').trim() !== '';
    const onlyMissing = Object.values(errors).every(m => /را وارد کنید/.test(m));
    return { status: onlyMissing && hasValue ? 'incomplete' : 'invalid', errors };
  }
  const calc = calcRow({ cans: c.value, fee: f.value, perCarton: row.product.perCarton, discountBP: dBP, taxBP: tBP }, globals.mode);
  return { status: 'ok', errors, calc, parsed: { cans: c.value, fee: f.value, discountBP: dBP, taxBP: tBP, ownDiscount: String(row.discountPct ?? '').trim() !== '', ownTax: String(row.taxPct ?? '').trim() !== '' } };
}

/** جمع‌ها = مجموع مقادیر گردشده‌ی ردیف‌های کامل؛ به‌همراه کنترل صحت. */
export function sumTotals(calcs) {
  const t = { cartonsX100: 0, cans: 0, gross: 0, discount: 0, net: 0, tax: 0, final: 0 };
  for (const { calc, cans } of calcs) {
    t.cartonsX100 += calc.cartonsX100; t.cans += cans;
    t.gross += calc.gross; t.discount += calc.discount; t.net += calc.net; t.tax += calc.tax; t.final += calc.final;
  }
  t.cartons = t.cartonsX100 / 100;
  t.grand = t.net + t.tax;
  t.consistent = t.grand === t.final && t.gross - t.discount === t.net;
  return t;
}
