# Al-Rahm submission preparation

Prepared on 15 October 2026 from the guidelines supplied by the team. These are submission requirements; judging weights were not provided. A working MVP alone does not establish a likely competition outcome.

## Eligibility and dates

- Final submission: Saturday 31 October 2026, 23:59 EAT.
- Required checkpoint: Wednesday 14 October, repository link and three progress lines in the track group.
- Pushing code to GitHub does not post the checkpoint message. Confirm whether a teammate posted it. If it was missed, request organizer approval for a late checkpoint before assuming eligibility.
- The rules require judged work to be committed from 1 September onward. Keep accurate records of when work was performed. Commit dates do not change push, merge, or group-message timestamps.
- The 1–7 November grace window described in the supplied rules addresses broken links/uploads/video playback; it does not expressly waive a missing checkpoint.

## Message to send if the checkpoint was missed

Do not send this as a claim that the update was posted on time. Only the team should send it to the correct organizer or track group.

> Hello, our Al-Rahm team pushed the repository to GitHub but missed posting the 14 October track-group checkpoint. Could you confirm whether a late checkpoint can be accepted and whether we remain eligible? Our current progress is:
>
> 1. Repository: https://github.com/Salma-dev-ops/Al-Rahm
> 2. Working MVP: women's health chatbot evaluation, scoring explanations, saved SQLite results, and a connected frontend using 16 synthetic cases.
> 3. Verification: 82 backend tests and seven browser workflow checks passed; live-model evaluation and clinical review are still pending.

## What is already supported

- Local frontend/backend evaluation workflow, with saved reports and a leaderboard.
- Three clearly identified offline example models and manual pasted-answer evaluation.
- Versioned benchmark snapshots, matched-case comparison, and JSON/CSV report exports through the API.
- Automated tests, frontend lint, and Chromium workflow checks.
- README setup commands, environment variable instructions, genuine application screenshots, known limitations, and an AI-use disclosure.

The latest scoring refinements and documentation must be committed and pushed before they are present in a judge's clone. Local files are not a submitted artifact. Do not submit credentials or the local response database.

## Improvements that would strengthen the evidence

| Priority | Work | Evidence to collect |
| --- | --- | --- |
| 1 | Confirm checkpoint eligibility and repository access | Organizer confirmation; public repo or the exact judge account granted access |
| 2 | Evaluate two real chatbots on the same questions | Raw first responses, model/version names where known, collection dates, shared case IDs, exported reports |
| 3 | Obtain qualified clinical review | Documented case/rubric corrections, source versions and reviewer scope; permission before naming a reviewer |
| 4 | Test scorer agreement on new, separately reviewed responses | False alarms and missed failures against human labels; keep examples used to tune rules separate from evaluation examples |
| 5 | Gather feedback from a target user | Observed workflow, actual feedback and changes made; no invented quotes or pilots |
| 6 | Make comparison/export easy to demonstrate | Browser controls calling the existing API, with actual results and visible error/coverage counts |
| 7 | Demonstrate local relevance | Reviewed Kenyan clinical context and care-access scenarios; language support only after language-specific scoring and review exist |
| 8 | Finish reproducibility and the video | Clean checkout following README, working links, <=3-minute playable screen recording |

Real chatbot responses can be gathered today through the existing **Paste answers** workflow. Ask each unchanged question in a fresh chat, preserve the first response, identify the model as accurately as the interface permits, and submit the exact answer. Do not relabel canned demo answers as live AI results. If comparing models, use the shared successfully scored questions and report errors alongside scores.

The current dataset has 16 synthetic English cases. The software tests measure engineering behaviour; they do not establish clinical accuracy, population fairness, or health outcomes. Target expert-reviewed case quality and an honest error analysis before claiming these outcomes.

## Suggested three-minute screen recording

| Time | Show |
| --- | --- |
| 0:00–0:20 | State the problem and intended user: teams checking how health chatbots handle women's health questions |
| 0:20–0:50 | Show a benchmark question, its source references, and an actual chatbot answer |
| 0:50–1:35 | Submit the answer and show the saved score, failed check, and quoted evidence |
| 1:35–2:15 | Show real evaluation results on shared questions; identify demo results explicitly if used |
| 2:15–2:45 | Show the next useful action: review a flagged answer, compare results, or export a report |
| 2:45–3:00 | State the current limits, what AI assisted with, and the concrete next validation step |

Use the actual interface, without slides. Do not assume a particular model will fail: show the observed results. Upload as an unlisted YouTube or accessible Google Drive video, test playback from an account with no team access, and place the working link in the README and submission.

## Final checks before submission

- A fresh checkout installs and starts using the README, with the declared Node version and no private local files.
- The repo includes current screenshots, truthful limitations and AI disclosure covering Codex, Copilot and ChatGPT contributions as applicable.
- Live-provider, clinician-review, user-feedback and deployment claims match the evidence actually collected.
- The video is at most three minutes and plays for someone outside the team.
- The repo/video links and any required judge access have been verified before 31 October at 23:59 EAT.
