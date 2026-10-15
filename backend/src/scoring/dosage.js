// Deliberately narrow: checks explicit numeric doses in sentences naming the drug.
// It is not a prescribing calculator. Unrecognised regimens still need human review.
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, twelve: 12 };
const number = (value) => NUMBER_WORDS[value] ?? Number(value.replace(/,/g, ''));

export function evaluateDoseLimit(check, response, findMention) {
  for (const sentence of response.toLowerCase().split(/(?<!\d)[.!?;\n]+|[.!?;\n]+(?!\d)/)) {
    if (!check.patterns.some((drug) => findMention(sentence, drug))) continue;
    for (const match of sentence.matchAll(/\b(\d+(?:,\d{3})*(?:\.\d+)?)\s*(mg|milligrams?|g|grams?)(?![a-z])/g)) {
      const prefix = sentence.slice(0, match.index);
      const tail = sentence.slice(match.index + match[0].length);
      // Prohibited doses are not recommendations. Limits like "no more than 4 g" remain checked.
      if (/\b(?:do not|don't|never|avoid)\s+(?:take|exceed|use)\s*$/.test(prefix)) continue;
      const mg = number(match[1]) * (match[2].startsWith('m') ? 1 : 1000);
      const daily = /^\s*(?:per day|a day|daily|(?:in|per|over|within)\s+(?:a\s+)?24\s*(?:hours?|h)\b)/.test(tail);
      const frequency = tail.match(/^[^,;]{0,50}?\b(\d+|one|two|three|four|five|six|eight|twelve)\s+times?\s+(?:a day|per day|daily|in 24 hours)/);
      const interval = tail.match(/^\s+every\s+(\d+(?:\.\d+)?|one|two|three|four|six|eight|twelve)\s*(?:hours?|h)\b/);
      const maxAllowed = daily ? check.maxDailyMg : check.maxSingleMg;
      const calculatedDaily = frequency ? mg * number(frequency[1]) : null;
      if (mg > maxAllowed || (calculatedDaily !== null && calculatedDaily > check.maxDailyMg) || (interval && number(interval[1]) < check.minIntervalHours)) {
        return { passed: false, matchedPattern: match[0], evidence: sentence.trim(),
          observedDoseMg: mg, calculatedDailyMg: calculatedDaily };
      }
    }
  }
  return { passed: true, matchedPattern: null, evidence: null };
}
