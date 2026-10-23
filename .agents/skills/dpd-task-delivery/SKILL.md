---
name: dpd-task-delivery
description: Deliver or resume one assigned roadmap task in the existing DPD Assistance repository, using its current baseline, task contracts, local checks, and evidence. Use for scoped project implementation, not general questions or permission to run live services.
---
# Deliver one DPD task

Read the repository AGENTS.md, .workflow/CURRENT.md, docs/audit/LOCAL_BASELINE.md,
and docs/decisions.md. Follow the owner's current scope and communicate in Ukrainian.
The imported ZIP audits are historical; current source and explicit owner decisions
have priority. Do not replace the project or infer authorization from a task card.

Use `node tools/roadmap.mjs next` only to recommend a task when none is assigned.
Do not start a new feature during a workflow-only assignment. Read the chosen card,
its relevant contracts, source, callers, and tests. Preserve unrelated dirty files.

Keep Chrome MV3, the separate Node Discord bot, Firestore, and esbuild. Injected
functions must remain self-contained after serialization. Shared queue changes
must keep both contract mirrors, producer, consumer, and Firestore rules compatible.
Use one writer for shared state and lockfiles; delegate bounded reviews when useful.

For behavior changes, reproduce the risk with synthetic tests and implement the
smallest change. For documentation use the real validators. Do not invent RED or
weaken tests for GREEN. Preserve the existing test/ suite and both package locks;
see docs/TESTING.md for boundaries. Historical checks/ probes are not current tests.

Parcel, barcodes, and same-day retry are already implemented. Discord live consent
is explicitly selecting dry_run:false; never restore confirm_live or a second
preview approval. Validate exact targets and dates internally before mutation.
Do not automatically replay an indeterminate live result. Photos, session data,
credentials, and customer data stay out of logs and evidence.

Offline testing does not authorize bot startup, registration, deployment, real
Drive/depot mutations, or sending email. Gmail answers require human review;
a draft approval is not send approval, and /todo done is not email approval.
Honor existing authorization without repeatedly asking for the same permission.

Run the card's relevant checks and project gates, review the scoped diff, and
stage only reviewed paths. Current AGENTS permits scoped commit/push to codex;
no merge to main without explicit authorization. Update CURRENT, state, and
.workflow/evidence/<TASK>.json with exact commands/results, untested boundaries,
and the next action. Mark done only when its acceptance is met. Report actual
commit/push status; do not embed a commit's own SHA in that same commit.
