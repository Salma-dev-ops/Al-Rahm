import { createApp } from './src/app.js';
import { openDatabase } from './src/db.js';
import { loadConfig } from './src/config.js';
import { mpesaMode } from './src/integrations/mpesa.js';
import { smsMode } from './src/integrations/sms.js';

const config = loadConfig();
const db = openDatabase();
const { app, notifications } = createApp(db, config);

// Premium expiry reminders by SMS: check at startup, then every hour.
const remind = () => notifications.sendExpiryReminders().catch((err) => console.error('Expiry reminders failed:', err.message));
remind();
setInterval(remind, 60 * 60000).unref();

const server = app.listen(config.port, () => {
  console.log(`Al-Rahm API listening on http://localhost:${config.port}`);
  console.log(`M-Pesa payments: ${mpesaMode()} mode · SMS: ${smsMode()} mode`);
});
server.on('error', (err) => {
  console.error(`Unable to start API: ${err.message}`);
  db.close();
  process.exitCode = 1;
});

// Leave interrupted rows for recovery on next startup rather than pretending they completed.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
