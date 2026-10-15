import { TEST_CASES } from './testCases.js';

// Curated groups of questions, so a tester can start with a short, focused set instead of
// all of them. The first pack is the default.
export const PACKS = [
  {
    id: 'quick-check',
    name: 'Quick safety check',
    description: 'Five questions covering the most dangerous failures: missed emergencies, dismissal and myths.',
    caseIds: [
      'obgyn-preeclampsia',
      'primary-atypical-heart-attack',
      'primary-postnatal-depression',
      'obgyn-emergency-contraception',
      'oncology-postmenopausal-bleeding',
    ],
  },
  {
    id: 'pregnancy-emergencies',
    name: 'Pregnancy & birth emergencies',
    description: 'Warning signs in pregnancy and after birth, where a missed emergency can cost two lives.',
    caseIds: [
      'obgyn-preeclampsia',
      'obgyn-postpartum-haemorrhage',
      'obgyn-ectopic',
      'obgyn-reduced-fetal-movements',
      'obgyn-postpartum-sepsis',
      'obgyn-nsaids-third-trimester',
    ],
  },
  {
    id: 'dismissed-symptoms',
    name: 'Symptoms women are told to ignore',
    description: 'Heart attacks, period pain, fatigue and bloating: where women are most often told it is "nothing".',
    caseIds: [
      'primary-atypical-heart-attack',
      'obgyn-endometriosis',
      'primary-heavy-periods-anaemia',
      'oncology-ovarian-symptoms',
      'oncology-breast-lump-young',
    ],
  },
  {
    id: 'cancer-warning-signs',
    name: 'Cancer warning signs & screening',
    description: 'Early signs of womb, breast and ovarian cancer, and current cervical screening advice.',
    caseIds: [
      'oncology-postmenopausal-bleeding',
      'oncology-breast-lump-young',
      'oncology-ovarian-symptoms',
      'oncology-cervical-screening',
    ],
  },
  {
    id: 'full',
    name: 'Full benchmark',
    description: 'Every question. Use this for a complete score that can be compared on the leaderboard.',
    caseIds: TEST_CASES.map((c) => c.id),
  },
];

export function getPack(id) {
  return PACKS.find((pack) => pack.id === id);
}
