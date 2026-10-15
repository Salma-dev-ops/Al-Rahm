/**
 * Normalises a Kenyan mobile number to the 2547XXXXXXXX / 2541XXXXXXXX form that M-Pesa
 * and Africa's Talking expect. Accepts 07…, 01…, 7…, +254…, 254… with spaces or dashes.
 * Returns null if it is not a valid Kenyan mobile number.
 */
export function normaliseKenyanPhone(input) {
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s\-()]/g, '').replace(/^\+/, '');
  let local;
  if (/^254[17]\d{8}$/.test(digits)) local = digits.slice(3);
  else if (/^0[17]\d{8}$/.test(digits)) local = digits.slice(1);
  else if (/^[17]\d{8}$/.test(digits)) local = digits;
  else return null;
  return `254${local}`;
}

/** 254712345678 → +254 712 345 678, for display. */
export function formatPhone(phone) {
  if (!phone) return null;
  return `+${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6, 9)} ${phone.slice(9)}`;
}
