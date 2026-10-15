// Safaricom Daraja: M-Pesa Express (STK Push).
//
// With MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY and
// MPESA_CALLBACK_URL set, real STK Push requests are sent (sandbox unless MPESA_ENV=production).
// Without them the client runs in mock mode: no request leaves the server, and the payment
// "succeeds" after a few seconds, as if the customer had entered their PIN.

const BASE_URLS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke',
};

// Daraja returns this while the customer has not yet responded to the PIN prompt.
const STILL_PROCESSING = '500.001.1001';

// Result codes from Daraja that mean the customer cancelled or did not respond.
const CANCELLED_CODES = new Set(['1032', '1037']);

function config() {
  const env = process.env.MPESA_ENV === 'production' ? 'production' : 'sandbox';
  return {
    env,
    baseUrl: BASE_URLS[env],
    consumerKey: process.env.MPESA_CONSUMER_KEY,
    consumerSecret: process.env.MPESA_CONSUMER_SECRET,
    shortcode: process.env.MPESA_SHORTCODE,
    passkey: process.env.MPESA_PASSKEY,
    callbackUrl: process.env.MPESA_CALLBACK_URL,
  };
}

export function mpesaMode() {
  const c = config();
  return c.consumerKey && c.consumerSecret && c.shortcode && c.passkey && c.callbackUrl ? 'daraja' : 'mock';
}

// Daraja timestamps are in Kenyan time (EAT, UTC+3): YYYYMMDDHHmmss.
function timestamp(now = new Date()) {
  const eat = new Date(now.getTime() + 3 * 3600000);
  return eat.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

let cachedToken = null;

async function accessToken(c) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString('base64');
  const res = await fetch(`${c.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`M-Pesa authentication failed (${res.status}). Check the Daraja consumer key and secret.`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000 };
  return cachedToken.value;
}

async function darajaPost(c, path, body) {
  const res = await fetch(`${c.baseUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(c)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function password(c, ts) {
  return Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64');
}

/**
 * Sends the "enter your M-Pesa PIN" prompt to the customer's phone.
 * Returns { checkoutRequestId, merchantRequestId, customerMessage }.
 */
export async function stkPush({ phone, amount, accountReference, description }) {
  const c = config();
  const ts = timestamp();
  const { ok, data } = await darajaPost(c, '/mpesa/stkpush/v1/processrequest', {
    BusinessShortCode: c.shortcode,
    Password: password(c, ts),
    Timestamp: ts,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: c.shortcode,
    PhoneNumber: phone,
    CallBackURL: c.callbackUrl,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: description.slice(0, 13),
  });
  if (!ok || data.ResponseCode !== '0') {
    throw new Error(data.errorMessage || data.ResponseDescription || 'M-Pesa could not start the payment.');
  }
  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
    customerMessage: data.CustomerMessage,
  };
}

/** Maps a Daraja result code to our payment status. */
export function statusForResultCode(code) {
  const value = String(code);
  if (value === '0') return 'paid';
  if (CANCELLED_CODES.has(value)) return 'cancelled';
  return 'failed';
}

/**
 * Asks Daraja for the outcome of an STK Push (used when the callback is slow or lost).
 * Returns { status: 'pending' | 'paid' | 'failed' | 'cancelled', resultDesc }.
 */
export async function queryStkStatus(checkoutRequestId) {
  const c = config();
  const ts = timestamp();
  const { data } = await darajaPost(c, '/mpesa/stkpushquery/v1/query', {
    BusinessShortCode: c.shortcode,
    Password: password(c, ts),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId,
  });
  if (data.errorCode === STILL_PROCESSING) return { status: 'pending', resultDesc: data.errorMessage };
  if (data.ResultCode === undefined) return { status: 'pending', resultDesc: data.errorMessage ?? null };
  return { status: statusForResultCode(data.ResultCode), resultDesc: data.ResultDesc };
}

/**
 * Reads Daraja's STK callback body:
 * { Body: { stkCallback: { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata: { Item: [...] } } } }
 */
export function parseStkCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return null;
  const items = Object.fromEntries((cb.CallbackMetadata?.Item ?? []).map((i) => [i.Name, i.Value]));
  return {
    checkoutRequestId: cb.CheckoutRequestID,
    status: statusForResultCode(cb.ResultCode),
    resultDesc: cb.ResultDesc,
    amount: items.Amount,
    receipt: items.MpesaReceiptNumber,
    phone: items.PhoneNumber ? String(items.PhoneNumber) : null,
  };
}
