// Africa's Talking SMS.
//
// With AT_USERNAME and AT_API_KEY set, messages are sent through Africa's Talking (the sandbox
// when AT_USERNAME is "sandbox"; view them in the sandbox simulator). Without them the client
// runs in mock mode: messages are only recorded in the database and logged to the console.

export function smsMode() {
  return process.env.AT_USERNAME && process.env.AT_API_KEY ? 'africastalking' : 'mock';
}

/** Sends one SMS. `phone` is 2547XXXXXXXX. Returns { status: 'sent' | 'failed' | 'mock', providerResponse }. */
export async function sendSms(phone, message) {
  if (smsMode() === 'mock') {
    console.log(`[sms:mock] to +${phone}: ${message}`);
    return { status: 'mock', providerResponse: null };
  }

  const username = process.env.AT_USERNAME;
  const host = username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
  const form = new URLSearchParams({ username, to: `+${phone}`, message });
  if (process.env.AT_SENDER_ID) form.set('from', process.env.AT_SENDER_ID);

  try {
    const res = await fetch(`${host}/version1/messaging`, {
      method: 'POST',
      headers: {
        apiKey: process.env.AT_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const text = await res.text();
    let recipientStatus = null;
    try {
      recipientStatus = JSON.parse(text)?.SMSMessageData?.Recipients?.[0]?.status ?? null;
    } catch {
      // Non-JSON error body; kept as text below.
    }
    const sent = res.ok && (recipientStatus === null || /success|sent|queued/i.test(recipientStatus));
    return { status: sent ? 'sent' : 'failed', providerResponse: text.slice(0, 1000) };
  } catch (err) {
    return { status: 'failed', providerResponse: err.message };
  }
}
