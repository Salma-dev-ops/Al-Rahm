import { createApp } from './src/app.js';
import { openDatabase } from './src/db.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const db = openDatabase();
const { app } = createApp(db, config);

const server = app.listen(config.port, () => {
  console.log(`Al-Rahm API listening on http://localhost:${config.port}`);
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
