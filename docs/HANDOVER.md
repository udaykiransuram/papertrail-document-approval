# Assignment handover

[Back to README](../README.md)

Checked against the three-page **Take-home Challenge: Document Approval Workflow** brief supplied with the assignment. This checklist separates implemented functionality from delivery steps that still require the applicant.

## Requirement check

| Brief requirement                                                      | Status / evidence                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Submission tied to the signed-in user                                  | Implemented; server-derived owner, PDF/DOCX validation, [workflow tests](../workflow/tests/test_workflow.py).                                    |
| Submitter can track pending/approved/rejected                          | Implemented; own-document list and saved status, [browser journeys](../e2e/workflow.spec.ts).                                                    |
| Reviewer can list, approve, and reject                                 | Implemented; queue, optional in-app preview, confirmation, atomic final decision.                                                                |
| Create/list/fetch/update APIs and invalid-input errors                 | Implemented; [request/response reference](API.md) and backend tests.                                                                             |
| React frontend with submission/reviewer views and errors               | Implemented; loading/empty/error/retry states and [recovery tests](../e2e/recovery.spec.ts).                                                     |
| Storage of choice                                                      | Neon PostgreSQL + private Blob deployed; SQLite/local files offline.                                                                             |
| Critical tests and a single execution command                          | `pnpm test`; [coverage and limitations](TESTING.md).                                                                                             |
| Public URL bonus                                                       | [Live application](https://papertrail-document-approval.vercel.app/) linked from README.                                                         |
| README: FE/BE setup, API, decisions, AI usage, production improvements | Covered in README and linked guides.                                                                                                             |
| Meaningful source history                                              | Incremental commits preserved; cleanup does not rewrite history.                                                                                 |
| Approximately five-minute video, linked in README                      | **Pending recording and link.** Outline below.                                                                                                   |
| Private repository shared with `enghiring@springboard.com`             | **Delivery exception:** repository remains public by the applicant's explicit choice. Private-repository handover/access has not been completed. |

## Before sending

- [x] Include the live URL, source, runnable local setup, API examples, and AI disclosure.
- [x] Keep migrations, dependency locks, tests, and synthetic samples in the source.
- [x] Exclude local secrets, uploads/databases, dependencies, generated output, and test artifacts from Git.
- [ ] Confirm the latest submitted commit's CI run is green and its deployment is verified.
- [ ] Record the video, verify the link is accessible to the evaluator, and replace the pending video line in README.
- [ ] Resolve repository visibility/sharing against the brief. If private delivery is required, use the hosting platform's invitation flow to give the specified reviewer access. The current public setting has been preserved; no invitation is implied by this checklist.
- [ ] Send the source, live, and video links together. One-click demo access needs no password exchange. For separate account review, share configured credentials privately.

No automatic email, reviewer invitation, repository visibility change, or recording is performed by this checklist.

## Five-minute walkthrough

Prepare the app and repository before recording. Use a fresh synthetic title so the evaluator can follow the same record across roles. Demo role switching is fastest; use local Alex/Jamie accounts briefly to demonstrate ownership isolation.

| Time      | Show and explain                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:30 | State the problem: a submitter sends a document and one reviewer records a final decision. Show the README's architecture sketch.                              |
| 0:30–1:20 | Enter as Submitter, choose the sample PDF, enter a title, preview and zoom before submission, then show the highlighted pending row in the list.               |
| 1:20–2:10 | Switch to Reviewer. Search for the title, open/read it, approve through the centered confirmation, and show reviewer/time plus next/back actions.              |
| 2:10–2:50 | Submit a Word sample, preview it, and reject it. Return to Submitter to show both saved outcomes. Mention that a decision cannot be changed.                   |
| 2:50–3:20 | Demonstrate Alex/Jamie isolation locally, or show the relevant test. Explain that one-click demo identities use a separate shared workspace.                   |
| 3:20–4:10 | Open `models.py`, `permissions.py`, and `services.py`: state constraint, scoped access, atomic pending-only update, and storage cleanup on failed persistence. |
| 4:10–4:40 | Show a passing test run, `pnpm test`, and one meaningful failure case (invalid file or repeated decision).                                                     |
| 4:40–5:00 | Disclose Codex assistance. Explain the 4 MB limit, Word layout trade-off, and the first production improvements.                                                |

Keep credentials and environment files out of the recording. Use the architecture/API docs as reference rather than reading the entire README on screen.

## Source package

Share the Git repository or GitHub's source archive. The tracked source is the deliverable; do not zip the entire working directory, which contains ignored dependencies, local data, and operator configuration.

The two sample locations are intentional: `workflow/samples/` is available inside the backend runtime and to browser tests; `frontend/public/samples/` is available through the static frontend. Tests check that the copies match. Redundant test-only copies were removed.

A submission message can be as simple as:

> Here is my Document Approval Workflow submission: [source repository](https://github.com/udaykiransuram/papertrail-document-approval) and [live demo](https://papertrail-document-approval.vercel.app/). The README includes setup, API design, trade-offs, AI-use disclosure, and the single test command. The demo supports one-click access for both roles.

Add the actual walkthrough link before sending; the paragraph above is not a substitute for the required recording.
