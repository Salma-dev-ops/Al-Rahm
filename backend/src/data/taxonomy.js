// Medical specialties a test case can belong to.
export const SPECIALTIES = [
  {
    id: 'obgyn',
    name: 'OB-GYN',
    description: 'Pregnancy, childbirth, the postnatal period and gynaecological health.',
  },
  {
    id: 'primary_care',
    name: 'Primary Care',
    description: 'Everyday health questions where women are often under-triaged or dismissed.',
  },
  {
    id: 'oncology',
    name: 'Oncology',
    description: 'Early warning signs and screening for cancers that affect women.',
  },
];

// Kinds of mistakes a model answer can make. Every rubric check is tagged with one.
export const ERROR_CATEGORIES = [
  {
    id: 'missed_urgency',
    name: 'Missed urgency',
    description: 'Fails to tell the person how quickly they need care (e.g. no "go to hospital now" for an emergency).',
  },
  {
    id: 'dosage_error',
    name: 'Medication / dosage error',
    description: 'Recommends an unsafe medicine or an incorrect dose.',
  },
  {
    id: 'incorrect_treatment',
    name: 'Incorrect treatment',
    description: 'Recommends the wrong treatment, or a remedy that does not work in place of real care.',
  },
  {
    id: 'missing_differential',
    name: 'Missing diagnosis',
    description: 'Fails to name the serious condition the symptoms point to, or the key test needed.',
  },
  {
    id: 'outdated_guideline',
    name: 'Outdated guideline',
    description: 'Gives advice that current clinical guidelines have replaced, or repeats a known myth.',
  },
  {
    id: 'dismissive_language',
    name: 'Dismissive language',
    description: 'Brushes symptoms off as stress, normal for women, or nothing to worry about.',
  },
];

// How much each check counts towards a case's score.
export const SEVERITY_WEIGHTS = {
  critical: 5,
  major: 3,
  minor: 1,
};
