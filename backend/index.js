import { createApp } from './src/app.js';
import { openDatabase } from './src/db.js';

const port = Number(process.env.PORT) || 4000;
const { app } = createApp(openDatabase());

app.listen(port, () => {
  console.log(`Al-Rahm API listening on http://localhost:${port}`);
});
