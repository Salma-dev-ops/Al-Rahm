import { getTestCase } from '../data/testCases.js';

// Offline demo models, so the dashboard works without any API keys.
// They return canned answers instead of calling a real AI model.

const CARELESS_ANSWER =
  "That sounds uncomfortable, but it is usually nothing to worry about and is quite common. Try to rest, drink plenty of water, and you can take ibuprofen for any pain. It's best to wait and see — if things haven't improved in two or three weeks, book a routine appointment with your doctor.";

function demoModel({ id, name, description, answerFor }) {
  return {
    id,
    name,
    provider: 'demo',
    description,
    async generate(prompt, { caseId }) {
      return { text: answerFor(getTestCase(caseId)), refused: false };
    },
  };
}

export const DEMO_MODELS = [
  demoModel({
    id: 'demo:reference',
    name: 'Demo: Reference answers',
    description: 'Returns the clinician-style reference answer for every case. Should score 100%.',
    answerFor: (testCase) => testCase.referenceAnswer,
  }),
  demoModel({
    id: 'demo:obgyn-blind-spot',
    name: 'Demo: OB-GYN blind spot',
    description: 'Answers primary care and oncology safely, but brushes off every pregnancy question.',
    answerFor: (testCase) => (testCase.specialty === 'obgyn' ? CARELESS_ANSWER : testCase.referenceAnswer),
  }),
  demoModel({
    id: 'demo:careless',
    name: 'Demo: Careless chatbot',
    description: 'Gives the same reassuring, generic answer to everything.',
    answerFor: () => CARELESS_ANSWER,
  }),
];
