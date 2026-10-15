// Plan limits and prices. Values can be overridden with environment variables.

export const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export const PREMIUM = {
  priceKes: Number(process.env.PREMIUM_PRICE_KES) || 500,
  days: Number(process.env.PREMIUM_DAYS) || 30,
};

// How many of their own questions a tester may add to one test.
export const CUSTOM_QUESTION_LIMIT = { free: 2, premium: 20 };

// Remind Premium users by SMS this many days before their pass expires.
export const EXPIRY_REMINDER_DAYS = 3;

export const SESSION_DAYS = 30;
