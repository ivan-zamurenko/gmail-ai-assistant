# Firestore queue — контракт бота и расширения

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**v1.2, локальная сверка.** Разделы 1–5 описывают текущий код; исходный ZIP сохранён как история. Разделы 6–8 задают требования к дальнейшим изменениям. Не путать существующие поля с будущим протоколом acknowledgement.

## 1. Участники и источники истины

`bot/src/contract.js` и `src/queue/contract.js` содержат одинаковые значения `COMMANDS`, `RESCHEDULE_MODE`, `STATUS`, `TASK_SCHEMA_VERSION=2`, `TASKS_COLLECTION='tasks'`. На extension-стороне объекты заморожены через `Object.freeze`; это различие реализации, не разные протоколы. Изменять mirror values и тесты совместимости одной карточкой. Не добавлять третий словарь в popup.

`tasks` — обмен запросом/результатом depot. `todos` — личные задачи Discord. Gmail `AI-Reply` — метка почтовой очереди. `.workflow/state.json` — состояние разработки. Совпадение слова task не означает, что это одна коллекция.

## 2. Текущая схема task document

| Поле | Автор | Значение и проверяемая граница |
|---|---|---|
| `id` | bot | UUID документа; создаётся заново для каждой `enqueueAndWait()` |
| `schemaVersion` | bot | 2; executor отклоняет несовпадение |
| `command` | bot | `find` или `reschedule` |
| `args` | bot | find: `{conId}`; reschedule: `{mode,dryRun}` либо ещё `{conId,newDate}` для parcel; modes: all/parcel/barcodes/retry |
| `requestedBy` | bot | Discord user ID из interaction; не источник дополнительных полномочий executor |
| `executorUid` | bot config | Назначенный Firebase Auth UID профиля расширения |
| `status` | участник перехода | `pending`, `claimed`, `done`, `error`, `cancelled` |
| `createdAt` | bot | serverTimestamp |
| `expiresAt` | bot | Deadline захвата, `Date.now() + claimWindowMs`; default 60 000 ms |
| `claimedAt` | extension | serverTimestamp при claim |
| `completedAt` | extension / bot timeout | serverTimestamp завершения/отмены |
| `summary` | executor/writer | Строка; `writeResult()` подставляет пустую, если не дана |
| `details` | executor, optional | Строка детализации CAD |
| `parcel` | executor, optional | Минимизированный lookup result, не полный depot HTML |
| `execMs` | offscreen, optional | Время обработки из offscreen; не метрика всей Discord-сессии |

Источники: `bot/src/queue.js`, `src/offscreen/offscreen.js`, `src/queue/executor.js`, `src/queue/barcodeExecutor.js`. Для barcode progress имеются progressStage/progressCurrent/progressTotal/progressMs/progressAt; это диагностика, а не подтверждение внешней записи.

## 3. Текущие переходы состояния

```text
bot creates pending
  -> extension transaction: claimed, если срок захвата не истёк
  -> extension transaction: done | error

pending + истёк deadline -> cancelled без depot execution
bot timeout: pending -> cancelled
bot timeout: claimed -> предупреждение о неподтверждённом результате, не повтор операции
```

Бот по умолчанию ждёт 5 минут, barcodes handler задаёт 2 часа; это не тот же срок, что 60-секундное окно claim. `expiresAt` — не продлеваемая lease для уже выполняющегося задания. После claim срок не управляет автоматическим перезапуском и не отменяет уже начатый reschedule.

Listener бота использует `onSnapshot`, не polling. Offscreen подписан на `executorUid == current Firebase user.uid`. `scheduled` и `serial` предотвращают одновременную обработку в пределах одного работающего offscreen-контекста. `claimTask()` транзакционно проверяет pending. Это не гарантия координации с пользовательским popup или сохранения памяти процесса после restart.

## 4. Фактические Firestore rules

По `firestore.rules`: browser читает только task с совпадающим authenticated UID. Browser create/delete запрещены. Update разрешён только для допустимого status transition с ограниченным набором изменённых полей. Для claimed barcode tasks разрешены ограниченные progress updates с allowlist стадий, счётчиками 0…10000 и progressMs до 7200000; это не разрешает менять args. Terminal result требует `summary` string длиной до 500, `details` при наличии string до 2000, `execMs` int от 0 до 7200000, `parcel` при наличии map.

Проверка `parcel is map` не валидирует вложенную схему, размер отдельных строк или отсутствие PII. Schema validation executor и tests нужны отдельно. Наличие file rule не доказывает его публикацию, а текстовый тест на наличие строки не доказывает enforcement: S09-03 проверяет rules в Emulator.

Бот использует `firebase-admin` и service-account credential. По комментариям и границе этой реализации Admin SDK использует IAM, а не browser rules. Поэтому guild/permissions/input checks и ограничение server credentials обязательны отдельно. `/todos` закрыта для browser; изоляция userId реализована в bot queries.

## 5. Runtime message boundary

Для find/all/parcel/retry offscreen посылает `{type:'execute', task}`. Barcodes выполняется в offscreen DOM и использует узкие background ports для Drive token, lookup, reschedule и локальной recovery storage. Worker принимает execute и keepalive; текущий callback аргумент `_sender` не проверяет. Executor валидирует schemaVersion, command, find/parcel number, parcel date и boolean dryRun; barcodeExecutor отдельно валидирует barcode task. Авторство UI/очереди, identity и возможность обойти admission gate требуют S09-05; не объявлять sender validation существующей только из-за принадлежности extension.

MAIN получает сериализованные аргументы depot, не Discord token или service-account key. `findDepotTabs()` ищет по `DEPOT_URL_PATTERN`; selection и safety injected code надо проверить для нескольких вкладок. Сейчас catch injection error может перейти к другой вкладке. Для mutating действий не считать любой exception доказательством отсутствия записи: безопасный preflight и неопределённый исход разделяются в S09-09.

## 6. Требования к delivery и recovery — ещё не реализованные гарантии

Целевое требование: сохранить operation ID и terminal result до подтверждения доставки или явного перехода в recoverable состояние. Уже существующая локальная recovery-очередь точных depot targets решает другую задачу: повтор server errors текущего дня без сканирования Drive. Она не является durable журналом доставки Discord replies и не гарантирует восстановление любого claimed task. До S09-04 `finishWithResult()` видаляв task до Discord reply. Тепер terminal result зберігається до окремого delivery ACK; протокол нижче.

Не превращать повтор вывода сообщения в повтор depot command. Pending timeout, claimed timeout, успешное внешнее изменение с потерянным результатом и отказ показа в Discord — разные состояния. Нужны ограниченные attempts, actionable safe error и сверка внешнего результата. Exactly-once внешних depot writes не обещается.

Retention, очистка и доступ к журналу задаются явной конфигурацией и G_PRIVACY; здесь нет произвольно выбранного срока хранения клиентских данных. До live-допуска тестировать синтетическую политику на Emulator/fixtures и обозначать её тестовой.

## 7. Совместимость изменений

До добавления новых полей acknowledgement/preview сначала записать producer/consumer schema, правила старых и новых клиентов, порядок rollout и rollback. Затем обновить оба mirror-контракта, queue writer, listener, executor, rules, тесты и документацию. Не создавать SQL migrations для Firestore.

Несовместимые версии должны отказывать безопасно, без depot injection. Не удалять все `tasks` при обновлении. Смена executorUid не должна бесконтрольно передавать pending live-задачи новому исполнителю. Пока команда claimed с неопределённым исходом, повтор допустим только после сверки.

## 8. Definition of Done и ссылки

Локально: test data не вызывает live Firebase; mirror equality, unauthorized UID, изменённые args, expiry, duplicate listener, restart и lost reply имеют отдельные проверки. На стенде: подтверждён конкретный guild/project/executor, правила и ограничения проверены реальными отказами на разрешённых synthetic записях.

[Стадия S09](../roadmap/ROADMAP.md) · [Security](security-and-privacy.md) · [Runbook](discord/RUNBOOK_RU.md) · [Test matrix](discord/TEST_MATRIX.md).

## S09-01 — перевірка сумісності, 2026-10-26

`bot/src/pendingTask.js` — чистий builder запису pending; `queue.js` передає
йому UUID, executorUid із config та Firestore timestamps. `requestedBy` надходить
із task, створеної Discord handler; це автор запиту, а не UID виконавця.
`args` лишаються вкладеними: не можуть підмінити identity, version чи status.
Builder не є перевіркою прав Discord — ця межа окремо перевіряється в S09-02.

Споживачі: collection — bot queue та extension listener; schema/command/mode —
executor і barcodeExecutor; status — queue/claim/result; executorUid — listener
filter та rules; requestedBy — metadata автора, не browser authorization;
createdAt/expiresAt — queue/claim timeout. Args конвертуються в depot-параметри,
а не поширюються довільно на envelope.

`test/queue/contract.test.mjs` порівнює п'ять mirror exports і перевіряє
чутливість до кожного synthetic drift, а також production builder без Firebase
startup. Executor-тести доводять відмову некоректним задачам до Chrome/ports.
Barcode `dryRun: null` тепер відхиляється; пропущене значення лишається `true`.
Schema 2, поля й підтримані all/parcel/barcodes/retry збережені. Barcodes
виконується окремо в offscreen, а не в worker executeTask.

Це локальні synthetic перевірки, не доказ live Firestore rules або Discord прав.

## S09-04 — реалізований протокол, 2026-10-28

Execution schema2 залишається. Bot-only additive metadata
`delivery: {version:1, guildId, deliveredAt?}` не впливає на extension claim/result.
Extension продовжує tx.update тільки чинних allowlisted fields; metadata не
дозволено змінювати з browser, rules не послаблюються. Старий extension сумісний
з новим ботом. Старий бот видаляє результати до reply — паралельний запуск або
rollback на нього не зберігає гарантію recovery. Legacy records без delivery
metadata не показуються новою recovery-командою.

Terminal execution result лишається у тому самому tasks document. Тільки після
успішного фінального Discord send/edit бот transactionally ставить deliveredAt,
тоді видаляє документ. Невдала доставка не ACK; невдале видалення після ACK
підбирає sweeper. Generic error notice не ACK. Restart recovery читає той самий
UUID внутрішньо, ніколи не enqueue. User key — exact consignment; доступ лише
автору + configured guild + Admin + configured executor. Recovery /find —
ephemeral group reply, не DM. Barcode existing DM route збережено.

Owner retention: 24h від persisted completedAt. Expired/ACKed результат більше
не показується. Sweeper на startup і періодично видаляє лише terminal expired/
ACKed записи; pending/claimed не видаляє. Коли бот offline, фізичне очищення
відкладається до запуску; Firestore TTL deployment не виконується.
Missing/invalid timestamps не є дозволом на безстроковий показ. Maps rerender
не повторює depot execution, але optional Maps recovery лишається S09-07.

Реалізація: queueService.js — injectable queue/retention, queue.js — production
wiring; resultRecovery.js — read-only recovery UI. `/result con_id:<number>`
фільтрує exact 9/14 digits (без конвертації); один збіг показується, кілька —
вибір. `/result` без номера показує також batch results, 4 на сторінку, UTC
час і live/preview у кнопці. Фільтрація за автором у Firestore, додатково
guild/executor/deliveryVersion/expiry; кнопки повторно перевіряють доступ.
Команда bot-only, у wire COMMANDS не додається й не створює task.

Cleanup на startup і щохвилини, без overlapping sweep. Лише terminal записи
поточного executor (чужий явно вказаний guild виключено): deliveredAt, expired
або invalid completion timestamp видаляються; legacy без metadata не показується,
але terminal expiry cleanup застосовується. Для server/client clock skew
допускається completedAt до 5 хвилин попереду; далеко future timestamp invalid.
24h не продовжується при читанні/повторному показі. Pending/claimed можуть
лишатись для звірки невідомого execution outcome; cleanup їх не скасовує.

Cancelled повертається як terminal result із попередженням, не успіхом;
claimed timeout далі попереджає не повторювати live. Generic error notice,
список результатів і render failure не ACK. Невдалий ACK не замінює вже
доставлену картку помилкою; delete failure після ACK підбирає sweep. Можливий
дубль повідомлення при втраченому Discord підтвердженні/ACK; exactly-once
message delivery не обіцяється, depot execution не повторюється.

Локальні fakes не перевіряють реальний Firestore Emulator/rules чи Discord SDK
мережеві виклики. Command registration, startup і deployment не виконано.
При rollout зупинити старий бот, оновити bot code і зареєструвати command за
окремим дозволом; extension/rules update не потрібні для additive metadata.

### S09-06 find projection bounds (2026-11-01)

Schema2 unchanged. Executor explicitly projects approved private address/contact,
scan, validated drop coordinates, timing and optional POD fields; arbitrary
lookup fields and diagnostics are excluded. Scan history over1000 entries or
serialized parcel over900000 UTF8 bytes returns a controlled error, not silently
truncated history. POD base64 is limited to700000 characters.
Optional additive `parcel.address.truncated: true` means navigation address
components were clipped/unsupported; renderer must not use that partial address
for routing. A separately valid Eircode can still be used. This flag contains no PII.

### Report command — S09-13 (2026-11-02)

Additive `command: report`, schema2 unchanged; old executor rejects unknown
command safely. Upgrade extension and bot together for this feature. Existing
Firestore terminal `parcel` map means no rules deployment required.
Args: `{conId, selection?: {parcel,type,date,time}, choiceTaskId?: taskUUID}`.
Only bot sets choiceTaskId after authorized retained-record read; extension
does not use it for depot work, recovery uses it to ACK the original choices.
Result `parcel.report`: version1; state choose with consNumber/candidates, or
state ready with consNumber/address/event. Event carries physical parcel,type,
date,time,signature and validated coords; no raw depot event IDs/notes. Optional
parcel.pod matches selected Delivered event only. Carded never uses Delivered POD.

Candidates are exact Delivered/Carded events with valid physical IDs/calendar
timestamps. Max1000 scans/25 candidates; duplicate tuples stop. Choice re-fetches
lookup and requires one exact tuple match; no mutation occurs. Complete address
whitelist: contact/company/lines/town/county/postCode/mobile (no email); max10
lines, each scalar/line/signature<=1000 UTF16 units, oversized returns error.
POD cap700000 base64 chars. Result stays comfortably below existing payload cap.

Choices remain in existing24h retained store until final delivery, and are
renderable via /result. Callback IDs contain taskUUID/index only; getResult
rechecks requester,guild,executor,expiry after guild/Admin gate. ACK after final
send; failed send retains both records. /result final ACK also cleans choices.

## S09-03 — actual local rules evidence

Firestore Emulator1.22.0 with exact rules-unit-testing5.0.0 tests assigned UID,
query scope, browser create/delete/todo denial, immutable fields, deadline
claim/cancel, no terminal rewrite and result bounds. Expired cancellation now
requires string summary<=500 (observed RED fixed). Nested parcel remains only
map-validated by rules; executor/renderer whitelist/limits remain compensation,
not a substitute for a future versioned shared nested schema. Admin SDK bypass
is used only for synthetic seed. No rules deployed or live credentials used.

## S09-05 — listener and runtime boundary

Privileged worker bridges accept browser-provided matching extension ID, exact
offscreen URL and no tab sender. Popup still injects directly. Offscreen creation
and heartbeat have one in-flight operation; worker health interval singleton.
Fixed20s/minute health checks continue recovery without tight retry or task replay;
failures logged once per episode. No new polling service or queue version.
Snapshot/claim/result paths verify current expected UID. UID change stops
subscription/heartbeat/new queued work; in-flight unknown result remains claimed,
never replayed. Fatal snapshot/auth setup failure stops listener with diagnostic;
operator reload/rebinding may be required. This is not automatic lease recovery.

### Additive find result coordinates — 2026-11-03
Optional parcel.scans[].coords = {lat:number,lng:number} preserves row association. Producer whitelist: exact Delivered/Carded, positive1–6-digit parcel identity, finite lat[-90,90]/lng[-180,180]. No extra coordinate properties/event IDs/notes forwarded. Consumer validates again and requires valid timestamp; mixed history is never mapped as selected parcel. No fallback to global drop. Existing schema2/command shape unchanged: old consumers ignore field, new consumers omit map when field absent. /find no longer fetches POD; existing optional POD projector support remains for legacy tests/results, renderer ignores it.

Find GPS whitelist extended in extension6.3.0.88: exact Failed Delivery and Incorrect Address join Delivered/Carded. Same per-scan parcel/finite-coordinate checks; Return to depot excluded. Optional field and schema2 compatibility unchanged.

### Reschedule result pages v1 — 2026-11-04

Optional `parcel.rescheduleResults = {version: 1, lines: string[]}` carries the private operator result; both contract mirrors define RESCHEDULE_RESULT_VERSION. Existing task schema2 and bounded details remain. Producer bounds4000 lines/600 chars/750000 serialized UTF-8 bytes plus explicit omitted marker; consumer validates4001 lines/600 chars/850000 serialized bytes. Existing rules permit the parcel map, no rule deployment needed. This map is not a find card. New bot must be activated before extension6.3.0.93: old bot normal replies use legacy details, but old /result misclassifies the envelope as find. Older extension results retain plain text fallback. Batch recovery uses /result without con_id; no new contained-number index.

Reschedule pages are ephemeral actor/guild/channel-bound snapshots, max16 sessions, fixed14min lifetime; clicks never enqueue or ACK. Barcode completion DM carries full bounded text attachment because guild navigation is unavailable in DM. Result ACK follows successful delivery.

## Mail commands — 2026-11-05

`mail_check` (args `{}`) → `done` with `parcel.mail`: up to 10 `{id, threadId, from, subject, date, text≤3500, noText}` for `in:inbox is:unread -label:AI-Read newer_than:3d`. `mail_mark` (args `{messageId}`) → adds the `AI-Read` label (created if missing). Both run non-interactive Gmail auth in the worker; missing auth is an explicit error. Task schema version unchanged (old extensions answer "Невідома queue command"); results use the existing terminal `parcel` map, so no rules deployment.
