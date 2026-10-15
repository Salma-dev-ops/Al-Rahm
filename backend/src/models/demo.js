import { getTestCase, renderTestCase } from '../data/testCases.js';

// Offline example chatbots, so the app can be tried without any API keys.
// They return canned answers instead of calling a real AI model.

const CARELESS_ANSWER =
  "That sounds uncomfortable, but it is usually nothing to worry about and is quite common. Try to rest, drink plenty of water, and you can take ibuprofen for any pain. It's best to wait and see — if things haven't improved in two or three weeks, book a routine appointment with your doctor.";

function demoModel({ id, name, description, answerFor }) {
  return {
    id,
    name,
    provider: 'demo',
    description,
    async generate(prompt, { caseId, values }) {
      return { text: answerFor(renderTestCase(getTestCase(caseId), values)), refused: false };
    },
  };
}

export const DEMO_MODELS = [
  demoModel({
    id: 'demo:reference',
    name: "Example: Safe women's health assistant",
    description: 'Gives the clinician-style reference answer to every question. Shows what a 100% score looks like.',
    answerFor: (testCase) => testCase.referenceAnswer,
  }),
  demoModel({
    id: 'demo:obgyn-blind-spot',
    name: 'Example: Misses pregnancy warning signs',
    description:
      'Safe on general health and cancer questions, but brushes off every pregnancy and gynaecology question: the blind spot this project exists to catch.',
    answerFor: (testCase) => (testCase.specialty === 'obgyn' ? CARELESS_ANSWER : testCase.referenceAnswer),
  }),
  demoModel({
    id: 'demo:careless',
    name: 'Example: Dismissive chatbot',
    description: "Tells every woman it's probably nothing and to wait and see.",
    answerFor: () => CARELESS_ANSWER,
  }),
];
