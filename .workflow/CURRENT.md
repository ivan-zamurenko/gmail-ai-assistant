# DPD Assistance — поточна передача

## S09-04 завершено локально — 2026-10-29

Owner погодив24h та /result за consignment. Base3e76bc9, branch codex.
delivery_impl передав writer root; delivery_review ACCEPT. Active writer немає,
state.active_task null. Root1.1.21, bot0.2.9; extension6.3.0.65/schema2 unchanged.

Terminal task зберігається до фактичного Discord send/edit і окремого ACK.
ACK transaction ставить delivery.deliveredAt, потім delete; sweep добирає
невдале видалення. Retention24h від completedAt, skew tolerance5min.
Expired/ACKed не показуються; startup/minutely sweep не видаляє pending/claimed.
Offline physical cleanup відкладено до запуску. Додано лише bot metadata,
rules та extension не змінені. Старий бот не запускати паралельно/при rollback:
він має delete-before-reply і не забезпечує recovery.

/result con_id:<consignment> — exact 9/14 digits; один збіг показується,
кілька — явний вибір. /result без номера — власний список, також batch,
4 на сторінку. Список/кнопки — озвучений engineering default після optional
питання, не окрема згода власника. Автор+guild+Admin+executor перевіряються;
відповідь ephemeral у груповому чаті. Internal UUID не вводиться користувачем.
Recovery не має enqueue: depot-команда не повторюється. Barcode DM збережено.

5 нових grouped regressions, focused12/12; full186/186,
lint/build/artifacts/docs/diff PASS. Evidence: [S09-04](evidence/S09-04.json).
Журнал: [WORKLOG](WORKLOG.md).

## Наступний крок і межі

Report-first next S09-06 — правильні дані картки й фізичної посилки.
Нове доручення не почато. Firebase Emulator/rules, реальний Discord, command
registration/startup/deployment не виконано. Перед live потрібно окремо
зареєструвати /result і запустити новий бот. Maps/render failure лишає результат,
але Maps стійкість — S09-07. Exactly-once показу повідомлення не обіцяється:
втрата Discord ACK може дати повторний показ, не повтор depot execution.

## Попередня передача (історія)

## S03-01 завершено локально — 2026-10-28

Owner «далі», base 9c5888b, branch codex. lookup_impl передав writer root;
lookup_review ACCEPT. Active writer немає, state.active_task null.
Обидва lookup режими вимагають exact identity; fetched detail звіряє number/ID.
Login/unsupported/empty/ambiguous різні safe reasons. Негативні malformed/login
outcomes не містять identity fields; genuine no-scans зберігає відому identity.
Унікальний numeric fallback ID тільки для detail. Success projection збережена.
Production зміни тільки lookup.js; depot mutation business rules не змінені.

3 нові grouped tests у чинному файлі; focused29/29, full181/181,
lint/build/artifacts/docs/diff PASS. Evidence: [S03-01](evidence/S03-01.json).
Root 1.1.20, extension 6.3.0.65; bot0.2.8 та queue schema2 без змін.

## Наступний крок і межі

Report-first next S09-04 — результат не губиться через збій Discord reply.
Нове доручення не почато. Перевірка S03-01 synthetic DOM objects + serialized
function у node:vm; не real HTML parser/browser/live depot. Невідомі depot
empty-state banners відхиляються, поки немає підтвердженого fixture.
14-digit→9-digit mapping не вигадано; потрібен exact query. Query лишається
operational correlation field, error reasons не містять session/body/query.
Журнал: [WORKLOG](WORKLOG.md).

## Попередня передача (історія)

## S02-04 завершено локально — 2026-10-28

Owner «давай», base 0eff656, branch codex. Writer root/gmail_ai_owner,
consignment_review ACCEPT. Active writer відсутній, state.active_task null.
Pure extractConsignments тепер повертає {status,candidates}, кожен candidate
має value, verified:false, reason:lookup-required. Статуси none/single/multiple,
invalid_input/input_too_large; combined cap 100000 UTF-16 code units.
Збережено heuristic 9/14 digits, leading zeros, subject→body order та dedup.
Немає runtime callers: це підготовлений модуль, не підключений Gmail/report.

3 нові grouped tests, RED0/3 → GREEN3/3; full 178/178,
lint/build/artifacts/docs/diff PASS. Evidence: [S02-04](evidence/S02-04.json).
Root 1.1.19, extension 6.3.0.64; bot лишився 0.2.8, schema 2 без змін.
Next report-first: S03-01 — depot HTML fixtures і перевірка lookup results.
Нове доручення ще не почато. Real Gmail/Chrome/depot/Discord не перевірялися.
Журнал: [WORKLOG](WORKLOG.md).

## Попередня передача (історія)

## S01-04 завершено локально — 2026-10-28

Owner «далі», base eac6c5d, branch codex. api_retry_impl передав writer root;
api_retry_review ACCEPT, active writer відсутній, state.active_task null.
Drive/Gmail HTTP: safe read максимум 3 спроби по 15s, pauses 250/500ms,
AbortSignal на request/body/backoff. Writes один раз; невідомий результат —
uncertain-write, без blind replay. 403 не refresh; 401 invalidate без batch replay.
Live depot injection exception/empty не повторює mutation в іншій вкладці.
Batch зберігає partial results і раніше успішні targets; решта not processed,
без downstream reschedule після uncertain/auth/cancel. File errors видно в summary.

Вісім нових grouped regression cases, focused 39/39, full 175/175;
lint/build/artifacts/docs/diff PASS. Evidence: [S01-04](evidence/S01-04.json).
Root 1.1.18, bot 0.2.8, extension 6.3.0.63; queue schema 2 без змін.

## Наступний крок і межі

Report-first next: S02-04 — витягування номера з тексту для lookup.
Нове доручення ще не почато. Live Chrome/depot/Google/Discord та manual reconcile
не перевірені; popup auth branch — code review, не browser test.
Нова кнопка Cancel не додана. Автоматичний reconcile/persistent Drive journal,
Maps (S09-07) і delivery recovery (S09-04) залишаються окремими задачами.
Report англійською в груповому Discord-чаті, чинна ephemeral видимість збережена.
POD fallback постачати з bot/assets. WhatsApp API не реалізовано.
Журнал: [WORKLOG](WORKLOG.md).

## Попередня передача (історія)

## S01-03 завершено локально — 2026-10-28

Власник доручив «роби». Base bd81f76, branch codex.
Writer safe_diagnostics_impl передав код інтегратору Codex/root;
safe_diagnostics_review завершив незалежний read-only review без блокерів.
Активного writer немає, state.active_task null.

Безпечні diagnostics у extension/bot: static operation/reason, HTTP/code;
без raw body, session URLs і parcel identifiers в automatic logs.
Operational cards/manual console results збережені. No-replay advice та
існуючі auth/tab routing не змінено. Schema 2 без змін.
Версії root 1.1.17, bot 0.2.7, extension 6.3.0.62.
Test-first: п’ять нових grouped cases у чинних файлах, labelBatch expectation
оновлено. Focused 76/76; full gate 167/167, lint/build/artifacts/docs/diff PASS.
Evidence: [S01-03](evidence/S01-03.json). Журнал: [WORKLOG](WORKLOG.md).

## Межі та наступний крок

Chrome/browser, depot, Discord startup/send і deployment не перевірено.
Synthetic popup harness не є браузерною перевіркою. Manual console tools
навмисно залишають дозволені operational дані; повний secret scan не заявлено.
Наступна report-first задача S01-04: класифікація API-помилок і обмежені повтори,
особливо без сліпого повторення mutation з непідтвердженим результатом.
Нове доручення ще не розпочато. S09-13 report залишається попереду залежностей.

## Збережені рішення

POD fallback завершено раніше: local bot/assets/pod-unavailable.png, core /find
збережено при POD error; photo timeout, Maps та delivery recovery ще окремо.
Report англійською, у груповому Discord-чаті, без переходу в DM;
чинна приватність /find ephemeral збережена. WhatsApp API не реалізовано.

Scope розширено на bot/src/interactions.js, commands.js, index.js, queueService.js
і чинні tests/discord/admission.test.mjs, test/bot/commands.test.js: фактичні
Discord send/ACK boundaries винесені з index. Конкретний recovery UX після
відповіді; docs/version/Git root після handoff.
