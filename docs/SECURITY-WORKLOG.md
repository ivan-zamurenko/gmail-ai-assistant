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
- Configured the private, gitignored bot settings with the extension executor
  UID and confirmed the bot reached its online state. The UID value was not
  written to this journal, staged, committed, or pushed.
- During a structural inspection of the private bot config, an existing Google
  Maps API key was inadvertently included in local tool output. It was not
  committed or pushed, but it must be treated as exposed in this session and
  rotated in Google Cloud; the replacement must remain only in private config.
- Diagnosed the reported bot/extension timeout with a PII-free queue health
  probe. The extension claimed the task and returned the expected controlled
  unknown-command result, confirming that executor UID, Firestore, offscreen,
  and service-worker messaging were connected.
- Found three simultaneous local Discord bot processes using the same bot
  identity. Two confirmed older duplicate processes were stopped with SIGTERM;
  the newest configured process was preserved and rechecked as the sole running
  bot instance. This removed the interaction acknowledgment race.
- Restored the full administrator-only `/find` parcel card at the owner's
  explicit request: recipient, company, mobile/telephone, email when available,
  full delivery address, Eircode, delivery depot, arranged date, and signature.
  Responses remain ephemeral; arbitrary scan notes and session data remain
  excluded. Documented that these cards must not be copied to public locations.
- Replaced the compact CAD marker with an aligned scan-history column formatted
  as `Bay: <number>, Seq: <sequence>` immediately to the right of scan time.
- Reorganized tests by module and replaced the barcode regression fixture with
  an explicitly synthetic consignment/parcel example; no real tracking data was
  added to the test suite.
- Locally decoded one owner-provided label photo from the gitignored
  `labels_example/` directory using the same browser ZXing path as the extension.
  No raw barcode payload or customer field was printed, logged, committed, or
  sent to an external decoder. The safe structural report confirmed PDF417, a
  31-field record, matching nine-digit consignment positions, and parcel 1.
- Replaced the unverified PDF417 test data and historical source-code examples
  with anonymized values that preserve the confirmed field lengths and routing
  layout. The private source photo remains ignored and outside version control.
- Ran a read-only local barcode audit across 69 owner-provided label images in
  `labels_example/`. The 68 newly supplied private photos are gitignored; the
  pre-existing tracked `label_example.png` was not modified and remains known
  privacy debt. The audit used numeric in-memory file IDs and reported aggregate
  format/parser statistics only; filenames, barcode payloads, tracking numbers,
  and customer PII were not logged or newly committed. Temporary audit code,
  browser profile, and localhost server were removed after completion.
- Replaced the ZXing adapter's state-clearing `decode()` call with
  `decodeWithState()` so the configured PDF417/Code128/DataMatrix allowlist is
  preserved across image windows. Added a PII-free regression test using a fake
  reader; no private label data was added to the automated test suite.
- Repeated the same read-only 69-image audit after the reader-state fix. All 69
  images produced a parseable consignment with no processing error or contested
  result; only PDF417 and Code128 were returned, while DataMatrix remained
  unobserved. One aggregate parcel-zero result was flagged for separate review.
  No filenames, payloads, tracking numbers, or customer fields were logged, and
  the temporary localhost audit environment was removed again.
- Repeated the local audit with original filenames visible only in the owner's
  private local report, as explicitly requested, to locate the parcel-zero
  result. The diagnosis confirmed a two-digit parcel whose Code128 suffix was
  zero and whose PDF417 routing carried the complete parcel number. Fixed the
  PII-free selection rule and regression test without committing the filename,
  barcode payload, consignment, or customer data.
- Removed DataMatrix from the production ZXing allowlist after two local audits
  of the 69-image private set returned only PDF417 and Code128. Added a PII-free
  supported-format contract test and corrected documentation that had inferred
  DataMatrix from a label's appearance without decoded evidence.
- Audited PDF417 candidates without recognized routing using original filenames
  only in the owner's temporary local report. Two parseable candidates came
  from one image and its matching Code128 independently confirmed parcel one;
  five earlier aggregate candidates were parser-rejected rather than fallbacks.
  Updated selection so an assumed PDF417 parcel one cannot overwrite an exact
  Code128 parcel, without committing any filename, barcode, or customer data.
- Added a fail-closed boundary between diagnostic barcode ranking and Drive
  filing. A photo containing more than one parsed consignment is now reported
  as contested but cannot send either candidate to depot verification or rename
  the file under a guessed parcel number; it follows the existing unknown path.
  Added a regression test using two fully synthetic Code128 payloads.
- Removed the implicit parcel-one assumption from PDF417 records without
  recognized routing. The parser now preserves the consignment diagnostically
  with an unknown parcel, while the filing boundary requires an exact positive
  parcel from PDF417 routing or matching Code128 before depot verification.
  Added a synthetic regression test; no label content or identifier was stored.
- Re-ran all 69 private label images through the production barcode ranking and
  new exact-parcel boundary. All 69 were parsed and safely accepted, with zero
  rejected results. Original filenames remained available only in the temporary
  local report; the audit environment was removed and no label data was committed.
- Found that Drive label dry-run skipped photo moves but could still create
  missing YYYY/MM folders. Extracted folder planning behind explicit adapter
  callbacks and made missing folders virtual during dry-run, so no create/write
  callback can run. Added a synthetic regression test with no token or Drive data.
