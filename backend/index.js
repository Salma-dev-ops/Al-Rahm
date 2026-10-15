import { createApp } from './src/app.js';
import { openDatabase } from './src/db.js';
import { mpesaMode } from './src/integrations/mpesa.js';
import { smsMode } from './src/integrations/sms.js';

const port = Number(process.env.PORT) || 4000;
const { app, notifications } = createApp(openDatabase());

// Premium expiry reminders by SMS: check at startup, then every hour.
const remind = () => notifications.sendExpiryReminders().catch((err) => console.error('Expiry reminders failed:', err.message));
remind();
setInterval(remind, 60 * 60000).unref();

app.listen(port, () => {
  console.log(`Al-Rahm API listening on http://localhost:${port}`);
  console.log(`M-Pesa payments: ${mpesaMode()} mode · SMS: ${smsMode()} mode`);
});
