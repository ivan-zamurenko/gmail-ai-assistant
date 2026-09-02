# DPD Assistance — Agent Instructions

These instructions apply to the whole repository. The project owner is the
founder and final decision-maker. Work in the `codex` branch unless the owner
explicitly authorizes another branch or a merge into `main`.

## Required project context

Before changing the project, read and follow:

1. `docs/TEAM.md` — team charter, roles, working agreement, and roadmap.
2. `docs/SECURITY.md` — access, secrets, PII, and deployment boundaries.
3. `README.md` — current product surface and architecture overview.
4. Relevant decisions in `docs/TOOLING.md` for tools, libraries, Gmail, OCR,
   barcode, AI, or MV3 work.
5. `docs/TESTING.md` before adding, changing, or reorganizing tests.
6. `docs/SECURITY-WORKLOG.md` before security-related work.

If documentation conflicts with the working code, diagnose the difference and
report it. Do not silently invent a new architecture. Newer explicit owner
decisions override older documentation and should be recorded in the relevant
project document.

## Working method

1. Diagnose, then understand, then change.
2. Make the smallest sufficient change. Do not refactor unrelated code.
3. Treat the architecture as a LEGO constructor: small replaceable modules,
   one responsibility each, joined by explicit contracts.
4. Keep UI and Discord handlers thin. Business rules belong in domain/use-case
   modules; provider details belong in adapters.
5. Preserve extension and bot independence. Their shared queue contract is a
   deliberate boundary and must be versioned when compatibility changes.
6. Large refactors require an agreed plan and small verified steps.
7. Explain why, alternatives, trade-offs, and the likely 1–2 year consequence.
8. Optimize for one owner and one always-on Mac. Use disciplined, simple
   solutions; avoid hyperscale infrastructure and process bureaucracy.

## Architecture invariants

- Chrome MV3 extension performs depot work inside the authenticated depot tab.
- Depot functions injected with `executeScript` must remain self-contained;
  MAIN world is used only where the depot requires it.
- Popup and Discord are presentation/orchestration layers, not duplicate domain
  implementations.
- Firestore tasks are versioned, assigned to one executor UID, expiring,
  transactionally claimed, serially executed, and never blindly replayed after
  an indeterminate live result.
- Scanning History is the source of truth for parcel movement and delivery.
- One consignment may contain multiple physical parcels; preserve parcel-level
  identity and status.
- Prefer one exact result over several approximate matches. Ambiguity stops the
  automation and goes to a human.
- AI output must be grounded in depot data. It must not invent missing facts;
  customer communication starts as a draft with human review.
- Mutating depot actions default to dry-run. Per the owner's 2026-09-02
  decision, explicitly selecting `dry_run:false` is the live confirmation;
  Discord commands must not require a second `confirm_live` option.

## Team review lenses

Use the relevant voices from `docs/TEAM.md`, not every role for every change:

- Priya: module boundaries, contracts, and long-term architecture.
- Liam: real DPD depot behavior and scan semantics.
- Ravi: exact lookup, normalization, and retrieval.
- Aria: grounded AI and customer communication.
- Viktor: parcel/scan data and Scanning History pipelines.
- Marek: MV3, depot tab, popup, and injected execution.
- Sofia: Discord, Firestore, task orchestration, and state transitions.
- Nora: operator-readable commands and reports.
- Grace: tests, regression evidence, and dry-run safety.
- Elena: secrets, OAuth, PII, and outbound data.
- Hassan: always-on operation, recovery, timeouts, and retries.

The owner makes the final product and trade-off decision.

## Security and data

- Never commit or print private config, credentials, auth tokens, depot session
  URLs, service accounts, or API keys.
- Customer parcel cards contain PII. `/find` must remain administrator-only and
  ephemeral; never copy cards into logs, issues, screenshots, or source control.
- Send only fields required by the explicitly approved workflow. Arbitrary depot
  notes and session data stay local.
- Record every security-related action in `docs/SECURITY-WORKLOG.md` without
  secrets, identifiers, customer data, or tracking data.
- Preserve deny-by-default Firestore rules and least-privilege OAuth scopes.

## Quality and delivery

- Every completed product change must include the version bump for each affected
  artifact: extension in `manifest.json`, root package in `package.json` and its
  lock file, bot in `bot/package.json` and its lock file.
- Documentation-only audit/governance entries do not require an app release;
  bump the root package only when the owner treats the governance change as a
  repository release.
- Before committing code, run proportionate checks. The default full gate is:
  `npm run lint`, `npm test`, `npm run build`, and `git diff --check`.
- Add or update a regression test for behavior changes when technically
  possible. Passing lint/build alone is not proof of domain correctness.
- Keep `docs/TESTING.md` current when a test adds a new protected risk, testing
  level, fixture source, or coverage boundary.
- Commit one logical change at a time in `codex` and push it so the open PR stays
  current. Do not merge into `main` without explicit owner authorization.
- Preserve unrelated user work and untracked files. In particular, do not add,
  edit, delete, or commit unrelated EVE guide files.
