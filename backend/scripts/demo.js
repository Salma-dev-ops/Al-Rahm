import { openDatabase } from '../src/db.js';
import { createEvaluationService } from '../src/services/evaluation.js';
import { DEMO_MODELS } from '../src/models/demo.js';

const db = openDatabase();
try {
  const service = createEvaluationService(db);
  for (const model of DEMO_MODELS) {
    const { run, done } = service.startRun(model);
    await done;
    const saved = service.getRun(run.id);
    if (saved.status !== 'completed') throw new Error(saved.error);
    console.log(`${model.name}\n  Score: ${saved.summary.averageScore}% | Unsafe: ${saved.summary.unsafeRate}% | Cases: ${saved.caseCount}\n  Report: /runs/${run.id}`);
  }
  console.log('\nSaved three offline example evaluations. Start the backend and frontend, then open /results.');
} finally {
  db.close();
}
