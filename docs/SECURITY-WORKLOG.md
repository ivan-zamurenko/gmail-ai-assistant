# Security worklog

This file records security-related work on DPD Assistance. Never write secrets,
session identifiers, customer names, addresses, tracking data, or label contents
into this log.

## 2026-08-28

- 14:46 IST — Started the remediation pass requested after the repository audit.
- 14:46 IST — Reviewed the existing uncommitted changes before editing overlapping
  files. Confirmed they contain in-progress `/find` timing, map rendering,
  multi-parcel display, offscreen keepalive, and depot-tab warm-up work; these
  changes must be preserved.
- 14:46 IST — Agreed remediation scope: sanitize depot errors, make `/find`
  private, minimize parcel data crossing Firestore/Discord, add strict command
  validation, make queue execution expiring/claim-based/serial, add Discord
  guild and administrator gates, and validate the active depot tab.
- 14:46 IST — No credential values or customer data were printed or copied into
  this journal.
- 14:46 IST — Added centralized outbound error sanitization. URLs and depot
  `session`/`UID` query values are redacted before errors can reach Firestore or
  Discord, and injected depot helpers no longer include request URLs or response
  text in errors/logs.
- 14:46 IST — Added a strict active-tab check before popup depot injections. The
  tab must use HTTP and a hostname ending in `.interlink.local`; removed the
  unnecessary `activeTab` permission because the explicit depot host permission
  already covers the intended pages.
- 14:46 IST — Restricted `/find` and `/reschedule` to Discord administrators in
  both command metadata and runtime handling, and added a configured-guild gate.
- 14:46 IST — Made depot command and `/find` replies ephemeral, sanitized bot
  errors, stopped logging full consignment numbers, validated `/find` as a 9- or
  14-digit number, and rejected normalized-but-impossible calendar dates.
- 14:46 IST — Versioned the queue contract and added explicit `claimed` and
  `cancelled` states. Added a required executor UID to the bot configuration so
  tasks can be bound to this one Chrome profile without a separate user login.
- 14:46 IST — Changed bot queue records to include `schemaVersion`, executor UID,
  and a short claim deadline. Pending tasks are transactionally cancelled when
  they time out; claimed tasks are reported as indeterminate instead of inviting
  an unsafe retry. Terminal task documents are deleted after the bot reads them.
- 14:46 IST — Replaced the mutable Discord tag/channel metadata in queue tasks
  with the stable requesting Discord user ID and extended the execution timeout
  while keeping a short pre-execution expiry.
- 14:46 IST — Reworked the extension listener to query only tasks assigned to its
  stable Firebase UID, atomically claim an unexpired pending task, execute one
  task at a time, and write a result only while the document is still claimed.
  A failed result write now leaves a fail-safe claimed task instead of silently
  replaying a non-idempotent depot operation.
- 14:46 IST — Added a one-line offscreen console message exposing only the
  non-secret executor UID needed for initial device binding; no auth token is
  logged.
- 14:46 IST — Added strict queue validation for schema version, command, mode,
  `dryRun` type, and consignment format. Unknown commands can no longer reach the
  CAD executor merely by supplying `mode: all`.
- 14:46 IST — Minimized `/find` data before it crosses Firestore: removed customer
  name/company, street lines, signature, arbitrary notes, scan depot, and unused
  detail fields. Discord now receives only the consignment, operational scan
  fields, area/Eircode, coordinates, timing, and extracted bay/onward-barcode
  markers. The visible search reference is shortened to its last four digits.
- 14:46 IST — Added deny-by-default Firestore rules. Browser reads are scoped to
  its assigned executor UID; browser creation/deletion is denied; task updates
  are limited to the expected pending/claimed/terminal state transitions and
  immutable task fields. Bot-only todos are denied to browser clients.
- 14:46 IST — Added Firebase rules configuration and a security setup guide for
  one-computer device binding, rules deployment, Discord command re-registration,
  and local secret-file permissions. Rules were added to the repository but were
  not deployed to the external Firebase project during this local change.
- 14:46 IST — Removed currently unused Chrome `storage` permission and Gemini API
  host access. Reduced Gmail OAuth from `gmail.modify` to `gmail.readonly`, which
  matches the currently wired label/message listing behavior. Kept the broad
  Drive scope temporarily because narrowing it without Google Picker would break
  the existing-folder workflow; documented that trade-off.
- 14:46 IST — Added explicit live-operation confirmation. Discord requires both
  `dry_run:false` and `confirm_live:true`; the popup shows a blocking confirmation
  before CAD changes or the combined Drive move/reschedule flow.
- 14:46 IST — Restricted the three existing local secret/config files from mode
  `0644` to `0600`; no file contents were read or logged during that action.
- 14:46 IST — Added repeatable Node security tests for outbound error redaction,
  strict rejection of invalid queue tasks, Discord command schema generation, and
  rendering of the minimized parcel payload. Added `npm test` as the test entry
  point.
- 14:46 IST — Changed bot listener-error handling to wait for the timeout
  transaction instead of rejecting early while a task may already be executing.
  Added Firestore result type/size bounds for summary, details, execution time,
  and parcel shape.
- 14:46 IST — Verified the already-pushed example label's public raw endpoint by
  HTTP status only; it returned `200`. The image body was discarded and no label
  data was displayed or copied. No remote repository state was changed.
- 14:46 IST — Expanded the lint target to cover bot source/config, security tests,
  and the build script instead of checking only extension source files.
- 14:46 IST — The expanded lint found two intentional ANSI escape-code regexes in
  the existing Discord renderer. Documented a bot-scoped `no-control-regex`
  exception; no renderer behavior was changed. The same run's security tests and
  production build remained successful.
- 14:46 IST — Final verification completed: expanded ESLint passed, all four Node
  security tests passed, every extension/bot/config/test JavaScript file passed
  `node --check`, the production extension build succeeded, and `git diff
  --check` found no whitespace errors.
- 14:46 IST — Confirmed that pre-existing user work in geo rendering, `/find`
  timing, multi-parcel display, depot-tab warm-up, and offscreen keepalive remains
  present. Unrelated untracked EVE guide files were not modified.
- 14:46 IST — Remaining manual/external steps were intentionally not performed:
  make the GitHub repository private, purge real label images from Git history,
  deploy Firestore rules, copy the runtime executor UID into private bot config,
  and re-register Discord commands.
- Prepared the reviewed remediation as a dedicated Git snapshot on the local
  `codex` branch. The unrelated untracked EVE guide files remain excluded, and
  ignored local credentials/configuration remain outside version control.
- Added structured CAD location fields for the Discord scan history: only the
  operational Bay and Sequence values cross Firestore. The raw depot tooltip,
  Service value, and other arbitrary notes remain local to the extension.
