# Discord-бот DPD Assistance — действующий код и план развития

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**Документ комплекта v1.2 согласован с локальным checkout. Исторический ZIP не описывает текущие capabilities.**

Содержание: назначение; команды; вывод информации; цепочка выполнения; доступ; ограничения; почта и ИИ; задачи и приёмка.

## 1. Назначение и статус

В `bot/` уже есть отдельный Node.js-процесс с `discord.js` и `firebase-admin`. Это не будущий webhook и не функция внутри popup. Бот принимает slash-команды, обращается к Firestore и возвращает ответ оператору. Для depot-команд ему нужен исполнитель в Chrome-расширении и подходящая авторизованная depot-вкладка. `/todo` работает непосредственно через бот и Firestore, без расширения.

Этот документ сохраняет существующую реализацию. «Реализовано» ниже означает обнаруженный подключённый путь в исходниках. Оно не означает успешную регистрацию команд, доступ к Firebase, запущенный бот или подтверждённое выполнение в рабочем depot. Такие проверки относятся к S09-12 и отдельным допускам.

## 2. Каталог slash-команд

| Команда | Аргументы и текущая логика | Состояние в новом архиве | Карточка развития |
|---|---|---|---|
| `/find` | `con_id`: строка из 9 либо 14 цифр; очередь `command=find`; lookup и карточки результата | Исполнитель подключён; live не проверен | S09-06 |
| `/reschedule all` | Необязательный `dry_run` по умолчанию `true`; `dry_run:false` подтверждает live; запуск CAD | Исполнитель подключён; live не проверен | S09-09 |
| `/reschedule parcel` | Обязательные `con_id`, `new_date`; дата `YYYY-MM-DD`, будущий будний день по локальному времени процесса бота | Точный lookup и выбранная дата подключены; live в этой сессии не проверен | S09-10, проверка существующего режима |
| `/reschedule barcodes` | `dry_run`; offscreen Drive scan → verified targets → reschedule | Offscreen executor подключён; live в этой сессии не проверен | S09-11, проверка существующего режима |
| `/reschedule retry` | `dry_run`; только сохранённые server errors текущего дня, без Drive scan | Подключено; вчерашняя партия удаляется | Recovery regression tests |
| `/todo add` | `text`; сохраняет личную задачу оператора | Реализовано в `todos` | S09-08 |
| `/todo list` | Задачи текущего Discord user ID, сортировка по `createdAt` | Реализовано | S09-08 |
| `/todo done` | `number`: текущая позиция в списке, начиная с 1 | Реализовано; не является почтовым одобрением | S09-08 |
| `/todo clear` | Удаляет только завершённые задачи данного пользователя, не весь список | Реализовано | S09-08 |

Источники: `bot/src/commands.js`, `bot/src/interactions.js`, `bot/src/index.js`, `src/queue/executor.js`, `src/queue/barcodeExecutor.js` и `src/offscreen/offscreen.js`. Find и parcel валидируют номер в handler и executor; parcel также проверяет дату на обеих границах. Barcodes маршрутизируется offscreen отдельно от обычного executor.

Текущие тексты slash-команд преимущественно украинские, часть ответов английская. Русский язык этой документации не разрешает молча переводить существующий интерфейс.

## 3. Какая информация выводится

### `/find`

`bot/src/render.js` формирует две карточки: основную и историю. Заголовок использует последнее событие по вычисленному timestamp сканирования, а не только потенциально устаревшую надпись detail page. Для нескольких физических посылок выбирается последнее событие каждой и показывается количество, совпадающее с заголовочным статусом.

Вывод содержит consignment number, статус, время события, post code, town/county; для отдельных событий — route, Bay и Onward BC. Полный адрес, имя, подпись и произвольные notes не включаются в объект, формируемый `runFind()`. Но номер, Eircode и координаты остаются чувствительными операционными данными: это минимизация, не анонимизация.

История ограничена `MAX_HISTORY = 12`. Дописывается число скрытых более ранних событий. Сейчас `historyBlock()` разворачивает входной массив, а не выполняет собственную сортировку всех событий по timestamp; независимость от порядка входа является сценарием S09-06, не доказанной гарантией.

### Карта и расстояние

При наличии `drop`, валидного по текущему parser Eircode и Google Maps key вызываются `geocode()` и `mapImage()`. Расстояние вычисляется через `haversineKm()` по прямой, не по автомобильному маршруту. Ссылка на маршрут может выводиться при наличии `drop` даже без изображения. Ключ используется в серверном запросе бота; изображение передаётся как attachment, а не как URL с ключом.

Текущий код не содержит полноценной изоляции исключений Maps от вывода depot-фактов. Поэтому «карта необязательна» как цель ещё не означает, что любой её сбой не потеряет основной ответ. S09-07 добавляет проверяемую деградацию. Стоимость, доступность Maps и утверждения комментариев о бесплатных квотах здесь не подтверждаются и не копируются как условия сервиса.

### `/reschedule all` и `/todo`

CAD возвращает dry-run count со списком packages либо changed/skipped/errors. Детальный блок ограничен 25 строками и строкой о скрытом остатке. Лимит строк не является доказательством соблюдения всех ограничений длины Discord payload: длинные поля проверяются отдельно в S09-06/S09-09.

Личный checklist показывает номер позиции, текст и отметку выполнения. Сейчас `renderList()` не задаёт собственную pagination/ограничение общего размера. Это предмет S09-08, а не основание выдавать большие списки за проверенные.

## 4. Как доставляется ответ

```text
Discord slash interaction
  -> bot/src/interactions.js: guild + permission + input checks (wired by index.js)
  -> bot/src/queue.js: документ tasks
  -> Firestore
  -> src/offscreen/offscreen.js: assigned listener + claim
  -> для barcodes: offscreen barcodeExecutor + narrow background ports
  -> для остальных depot tasks: runtime message {type: 'execute', task}
  -> src/background/background.js
  -> src/queue/executor.js
  -> depotMain / depotLookup в MAIN подходящей вкладки
  -> Firestore terminal result
  -> bot render / editReply
```

`/todo` использует только `bot/src/todo.js` и коллекцию `todos`. Не смешивать её с `tasks`, Gmail label queue или `.workflow/state.json` — это четыре разных вида состояния.

Начальные ответы приватные (ephemeral). Для длительного barcodes scan handler передаёт progress, а итог (с 2026-11-04, решение владельца) публикует в канале команды, не в DM: только ненулевые группы с emoji, посылки сгруппированы по результату; длинный отчёт — несколькими сообщениями подряд, без файла. Передача данных Discord всё равно происходит. Сбой Discord нельзя лечить повторным depot reschedule: внешнее действие и показ результата — разные операции.

## 5. Доступ и live-подтверждение

На входе сравнивается `interaction.guildId` с `cfg.guildId`; `/find` и `/reschedule` требуют Administrator. `/todo` ограничен тем же guild, но не требует этой depot-проверки. Сохранить фактические защиты до отдельного reviewed решения о ролях. Не назначать боту глобальные Administrator permissions только из-за того, что они проверяются у оператора.

Явное `dry_run:false` является достаточным live-подтверждением по решению владельца; `confirm_live` отсутствует. В queue нет previewId/revision. S09-09 и S03-04/S03-05 могут укреплять внутреннюю проверку целей и актуальности, но не вводить второе операторское подтверждение без нового решения.

**S09-09 (2026-11-04):** `/reschedule all` використовує той самий `depotMain`, що popup.
Preview за замовчуванням (`dry_run` не вказано → dry-run) розділяє Дозволено/Пропущено/
Перевірка/Помилки (S03-04). Live (`dry_run:false`) не бере список з preview: заново
читає Pending, кожну посилку (CHECK) і повторно перевіряє перед Save (RECHECK), тож
зміна статусу/дати/складу між preview і live вже враховується без previewId (S03-05).
Невизначена ін'єкція або порожній результат live → «uncertain», без переходу на іншу
вкладку; зайнята іншим live-запуском вкладка (`Another reschedule is already running
in this tab`) теж зупиняє live на ній. Втрачена відповідь Discord не повторює depot-дію
(S09-04, `test/queue/delivery.test.mjs`). Тести: `test/queue/executor.test.js`.

## 6. Известные ограничения, не потерянные при модернизации

`finishWithResult()` в `bot/src/queue.js` инициирует удаление terminal document до успешного `editReply` в обработчике. После потери ответа нет доказанного durable recovery этого результата. `claimed` после сбоя также не имеет полноценного протокола восстановления. Транзакционный claim и последовательный Promise-chain полезны, но не доказывают exactly-once для depot writes или координацию popup и очереди.

`firebase.executorUid` связывает бот с Firebase UID конкретного профиля расширения. Сброс данных профиля или смена identity требуют сверки привязки; нельзя предполагать вечную стабильность anonymous UID. Rules в репозитории не доказывают их deployment. Детали: [queue-contract](queue-contract.md).

## 7. Gmail и ИИ — без изменения OWNER-D01

**OWNER-D01 остаётся обязательным: ИИ предлагает ответ, человек проверяет и правит, одобряет конкретный текст; затем создаётся Gmail draft, а отправляет человек в Gmail. auto-send не входит в текущий объём.** Связка — S06-05.

`/todo done` не одобряет письмо; `dry_run:false` относится к depot и не разрешает email send. Наличие бота не означает, что текст письма разрешено пересылать Discord или что участники сервера могут его читать.

В архиве нет Gmail review-кнопок, вывода AI proposal или создания draft из Discord. Проактивные уведомления «нужна проверка ответа» и перенос самого review в Discord остаются отдельным возможным расширением после решения владельца по интерфейсу, доступу и данным. В S09 такое расширение не маскируется под уже реализованные команды.

## 8. Работа по карточкам

S09-01…S09-09 сохраняют и проверяют существующие возможности и устраняют разрывы надёжности. S09-10/S09-11 требуют сверки с уже реализованными parcel/barcodes и проверки оставшихся acceptance; повторное подключение или отключение этих режимов не требуется. S09-12 проверяет согласованный набор команд на разрешённом стенде; реализованный код не заменяет допуск к live. S08-03 требует S09-12, чтобы общий пилот не пропустил бота.

Полные критерии: [roadmap](../roadmap/ROADMAP.md), [матрица тестов](discord/TEST_MATRIX.md), [runbook](discord/RUNBOOK_RU.md), [снимок исходников](audit/GITHUB_BASELINE.md).

## S09-02 — локальна перевірка admission, 2026-10-26

`index.js` запускає client і підключає реальні адаптери. `interactions.js`
експортує createInteractionHandler з явними залежностями; імпорт не запускає
бота й не читає Firebase/config. Guild/Admin перевірки залишені на вході.
Параметри читаються один раз до defer, queue або todo writes. Невідомі команди,
підкоманди, зламані getters і неправильні типи відхиляються приватною відповіддю
без echo вхідних значень. Помилка parsing не перезапускає бізнес-операцію.

Todo лишається доступним без depot Admin у дозволеному guild; userId береться
лише з interaction.user.id. Number — додатне ціле, text — непорожній рядок.
Відсутній optional boolean у Discord повертається як null і означає dryRun=true;
explicit false достатньо для live. До queue надходить уже boolean, тому це не
скасовує відхилення wire dryRun:null, додане в S09-01.

Schema команд, усі чотири reschedule modes, progress/DM та render збережені.
П'ять grouped synthetic admission tests перевіряють реальний handler з підставними
зовнішніми портами. Live permissions, registration, Firebase і Discord delivery
не перевірялись. Втрата відповіді залишається окремою задачею S09-04.

## POD fallback — 2026-10-26

Якщо фото немає (зокрема коли POD provider повернув error), /find зберігає
основну картку й додає локальну 404-графіку з підписом Delivery photo unavailable.
Справжній pod.jpg має пріоритет. [Asset та prompt](../bot/assets/README.md).
Папка bot/assets входить до поставки бота; шлях не залежить від cwd.
Executor пише лише технічний POD_UNAVAILABLE при provider error, без його
вмісту або клієнтських ідентифікаторів. Відсутність фото не означає втрату посилки.
Це не timeout захист: завислий POD-запит поки може затримати відповідь (S01-04).
Maps і Discord delivery recovery не змінені.

## Відновлення відповіді — S09-04

`/result con_id:123456789` показує власний недоставлений результат за номером
посилки протягом 24 годин від завершення. `/result` без номера — список,
зокрема пакетних команд. Кілька збігів — кнопки явного вибору, 4 на сторінку.
Усі відповіді recovery приватні в чаті; Admin і поточний guild обов’язкові.
Це лише повторний показ, не нова depot-операція. Після успішного показу результат
видаляється. Старий barcode DM flow збережено, /find не переноситься у DM.
Нова команда описана локально; реєстрацію та запуск у Discord ще не виконано.

## Find card validation — S09-06 (2026-11-01)

Private operational card preserves approved recipient/address/contact fields.
History sorts newest first, shows at most12 events with an omitted count.
Parcel0 is excluded when numbered physical parcels exist; unassigned events
remain visible and prevent a confirmed headline/count. Invalid calendar/time
values likewise show an unconfirmed status. Dates use full DD/MM/YYYY and
HH:MM[:SS], with UTC only as an ordering key, not a timezone conversion.
Photo/location remain consignment-level evidence and may describe different
parcels/events; exact association belongs to S09-13. This is not the driver report.

Malformed/oversized input produces bounded output: scan limit1000, embedded
text budget6000, POD base64 limit700000, serialized parcel limit900000 UTF8
bytes. Displayed address may be shortened; truncated navigation targets are
omitted unless a valid Eircode exists. Existing Maps provider failure behavior
is deferred to S09-07. No live/command-registration verification performed.

### POD failure diagnosis (2026-11-02)

Extension6.3.0.67 logs `[find] POD_UNAVAILABLE <code>` in its service-worker
console. AUTH_NOT_CONFIGURED: missing local API credentials; AUTH_HTTP_401/403:
authorization refused; AUTH_TOKEN_MISSING: successful response lacks token;
IMAGE_HTTP_<status>: image request rejected; IMAGE_UNAVAILABLE: no matching POD
record; EVENT_ID_MISSING/INVALID: unsupported event reference; REQUEST_FAILED:
request/encoding/parsing failure (not necessarily network); UNKNOWN: unclassified.
Only the code may be shared for diagnosis. Depot browser login and POD API auth
are separate. Existing fallback remains; this change does not fix the live cause.

## POD separate authorization — 2026-11-02

POD extension6.3.0.68 supports optional private podAuth.basicAuthorization, separate from body user/password. Absent field preserves previous header derivation. AccessToken is acquired on each POD fetch and not cached; RefreshToken is not used. Basic credentials have no expiry inferred from their encoding; provider rotation/revocation requires updating private config and rebuilding extension.

## POD image request alignment — 2026-11-02

Extension6.3.0.69 matches depot image request with explicit Bearer scheme. IMAGE_AUTH_REJECTED distinguishes observed HTTP200 authorization-failure response from absent photo. Successful real POD recovery still needs owner verification; changing scheme case is a source-alignment fix, not proven root cause.

## Driver report — S09-13 (2026-11-02)

`/report con_id:<9 or14 digits> [eircode:<correct destination>]` gives an English, Administrator-only ephemeral
report in the group chat. /find remains the full operational card. One eligible
event renders directly; multiple events show four choices per page, up to25.
Choose parcel and timestamp explicitly. Photos/GPS/signature come from the same
selected event. Carded is an attempted delivery point, never a collection point.
Goods Held and other scan types cannot supply report coordinates.

Output: consignment/physical parcel, recorded point/date/time/signature, correct
recipient/company/address/Eircode/phone, full clickable map URLs, photo or404.
No history/email/internal logs; no arbitrary depot notes. Maps URLs make no
provider request, need no API key; mobile app/browser behavior follows
[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
S09-14: both navigation links omit origin, using the device location when available.
Pickup uses selected-event GPS; delivery uses valid effective Eircode, even without GPS.
Carded labels its point as attempted delivery. No nearby Eircode is guessed.

Text can be copied to WhatsApp; photo copied separately. Auto URL previews and
mentions are suppressed. Text over1900 chars is attached as driver-report.txt
without losing address. /result recovers choices or final report without a new
lookup; pressing a selection performs a fresh read-only lookup for that event.

Versions root1.1.26/bot0.2.11/extension6.3.0.70. Offline validation only; command
registration, restart, real Discord/mobile report verification not yet performed.

## Find high-level presentation — 2026-11-02

/find presentation refreshed: headline status/count, latest event, grouped delivery address/contact/details, recorded location, map, POD, then plain chronological history (up to12). Empty optional fields, ANSI and duplicate address/searched-as removed. Evidence uncertainty remains in footer. GPS only with explicit Delivered/Carded drop.type; unknown/other types are not inferred from headline. Carded has no redelivery route. Distance labelled straight-line; route target encoded cap500 to protect1024 field size. /report behavior unchanged. Bot0.2.12/root1.1.27; extension remains6.3.0.70. Runtime restart/registration pending.

## Optional Maps isolation — S09-07 (2026-11-03)

/find keeps core facts, POD/404 and direct navigation links when Google lookup
or static map fails. A short footer says map preview is unavailable. No Maps
request without a configured key, valid Delivered/Carded drop and valid Eircode.
Failed address lookup stops enrichment; reverse lookup failure stops its variants
but does not prevent a static map using the resolved target. S09-14 adds optional
/report map enrichment through these same bounded adapters. Distance remains approximate straight-line, not road distance
or evidence of misdelivery.

One request attempt,1000ms deadline including streamed body; at most5 requests
per card (geocode1,reverse up to3,static1), about5s maximum I/O waiting excluding
event-loop scheduling. No retry on provider failure, cache or retained geodata.
JSON cap256000 bytes/max100 results; PNG cap2000000 bytes, MIME/signature/IHDR/IEND
checks (not a complete decoder/CRC check). Invalid coordinates/status/schema,
network/HTTP failure or timeout return unavailable. Fixed `[maps] UNAVAILABLE`
codes TIMEOUT/HTTP/INVALID_RESPONSE/SIZE_LIMIT/NO_RESULT/REQUEST_FAILED only;
no key, URL, coordinates or raw exceptions logged.
Root1.1.29/bot0.2.14; extension unchanged6.3.0.70. Offline validated; no live
Google/Discord check, registration or runtime restart in this task.

## S09-08 — personal checklist consistency

/todo done N resolves the last successfully delivered list in this bot session,
not a fresh positional query. Snapshot holds at most20 IDs+fingerprints for10min,
max1000 users; expiry/restart/stale record asks /todo list. Transactions recheck
actual document ID, userId and state; sender ID comes only from interaction.
List reads at most101 records, shows up to20 bounded rows and indicates partial
results; missing timestamps shown explicitly. Add text1..500, soft100-item limit
(not a transactionally enforced quota). Clear rechecks ownership/done per record
and reports confirmed removals/failed/partial counts. All replies disable mentions.
Stored todos are not automatically expired/deleted; /todo is unrelated to email
approval, queue or depot. No command shape change or live activation.

## Destination override and map — S09-14 (2026-11-03)

Omit eircode to use the depot value; explicit valid input wins for this report only.
Invalid/missing destination asks for a corrected /report invocation, without a misleading route. This successfully displayed correction prompt acknowledges the result; use /report again, not /result, to correct it.
Selection, pagination and recovery retain task.args.eircode. No queue schema or depot mutation.
Manual override leaves the street address unchanged: operator-only warning asks to check it before forwarding; pure text/export excludes that note.
Up to two bounded provider calls (geocode, static map), only with GPS/key/valid destination. Map first, POD/404 second. Red is recorded point, blue destination; line is not a driving route. Failure/missing map leaves text/links/POD with a short unavailable note. No provider URL/key in output.
Navigation links open independently from current device location, subject to device permission/app behavior. Copy text to WhatsApp and attach images separately; no clipboard automation.
Local checks passed; updated slash-command registration, bot activation and real mobile rendering remain unverified.

## WhatsApp-ready output — S09-15 (2026-11-03)
Supersedes S09-14 separate photos/operator note: ready /report automatically returns one driver-report.jpg (map above POD, contain/no crop) and clean plain driver caption with full URLs. No preparation button, extra state or command schema change. Map legend and unavailable-media notices live inside the image. Manual override no longer adds operator text; destination Eircode remains report-only and street address unchanged.
Forward by saving the single JPEG and pasting Copy Text as its WhatsApp caption. Not automatic transfer: images/text still require these two actions. Links remain text links, never baked into image. Long output retains complete driver-report.txt rather than clipping address; exceptional long captions may require a separate text message.
Image adapter accepts bounded JPEG/PNG/WebP, auto-orients, strips EXIF and uses404 for absent/invalid POD. Complete composition failure logs only a fixed code and sends existing placeholder plus useful caption. No new provider call beyond existing bounded Maps enrichment. Live device rendering to verify with owner.

## Report layout follow-up — 2026-11-03
Owner requested map left/POD right in one image, dark background and exact legend: red scanned point · blue delivery address. S09-15 follow-up uses1600x864 canvas, two792px contain panels with16px gap and72px header. No crop or change to caption/navigation. Supersedes vertical layout; no command/extension changes.

## Response auto-cleanup — S09-16
New responses from all commands and report/result buttons share responseLifecycle at runtime boundary. Private reply/defer deletes at interaction.createdTimestamp+14min; normal replies and DMs at send+30min. Updates do not renew timers. Followup visibility follows returned Discord flags. Already missing messages are harmless; failures emit fixed cleanup diagnostic, never replay depot.
After private expiry final edit rejects, so a result cannot be falsely ACKed as displayed. Barcode progress stops after expiry; final/error DM remains independent and gets30min cleanup. Queue retention unchanged.
Best-effort while Mac bot runs: restart loses timers, network/permission failure may leave a message visible; no old-history purge. A successfully delivered result already ACKed/deleted from recovery cannot be recovered solely because its Discord copy expired.
[Discord interaction token lifetime](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx).

## Two-button export — S09-17
Ready /report now adds open-for-whatsapp.html beside driver-report.jpg. Download the HTML and open it in Chrome on the work PC. Click image copy, paste into WhatsApp Web; return and click caption copy, paste specifically in the photo-caption field. Do not click both before pasting the image: clipboard is replaced. Real image/caption are embedded locally; no fetch, WhatsApp authentication, auto-send or clipboard read. Buttons are on the downloaded page, not inside Discord.
Escaped caption text, fixed raster data URI and restrictive CSP prevent caption markup execution/network access. Image<=3MiB,caption<=64KB,aggregate image+page+text<=8MiB. Export failure logs fixed code and preserves core report. Exceptional long captions may exceed WhatsApp limits; complete text remains available. Downloaded report contains customer data and is not deleted by Discord auto-cleanup. Owner confirmed synthetic two-button trial; actual attached export still needs smoke check.

## Discord Web copy controls — S09-18
After updating extension, open Discord Web chat, click DPD extension icon and “Увімкнути копіювання report у Discord”. Two local controls appear beside recognized ready /report: image and caption. Paste image into WhatsApp first, then copy/paste caption. Refresh Discord requires activation again. Bot/command schema unchanged.
The helper recognizes one message-content node and one exact driver-report.jpg attachment in the same rendered message; it rechecks at click, skips ambiguous/long-text-export-only messages and handles edited/removed rows. It is not a native Discord bot component. Actual Discord DOM/CORS/clipboard behavior needs work-PC smoke; synthetic tests cannot prove those. HTML export remains fallback.

### S09-18 button styling follow-up — 2026-11-03
Owner requested more polished controls. Scoped CSS adds DPD red image action, neutral caption action, distinct vector icons, rounded corners, hover/keyboard focus, reduced-motion support and green copied state. Copy behavior/access unchanged; loading/errors remain clear. Synthetic preview visually checked in isolated headless Chrome, not live Discord.

### WhatsApp caption styling — 2026-11-03
Owner confirmed preserving report text styling/emojis when pasted into WhatsApp. One pure shared/whatsappCaption.js formatter adds WhatsApp single-asterisk bold to known headings/labels, preserves values, newlines and full URLs. Used by extension Copy Caption and bot HTML export; native Discord report remains plain. Extension extracts emoji IMG alt and BR/text nodes rather than losing emoji via innerText. Shared module ships with repository for Node bot and is bundled into extension, no browser/runtime dependency. Existing downloaded HTML is unchanged; generate a new report.

### HTML export removed — owner decision 2026-11-03
Owner requested no generated HTML attachment. /report now returns image and caption only, plus existing .txt fallback for unusually long reports. open-for-whatsapp.html generation/module retired; S09-17 remains historical completed work, superseded by this decision. Discord Web extension copy buttons and WhatsApp caption formatter remain; extension version unchanged6.3.0.83. Previously downloaded HTML/files and already sent messages are not removed.

### Duplicate toolbar cleanup — 2026-11-03
Owner showed old gray and new styled controls simultaneously after extension updates. New mount retires legacy direct-child toolbars visually in place (avoids old observers recreating removed nodes), updates installed scoped CSS, and uses versioned controller/DOM stop event for future observer handoff across surviving contexts. Ctrl+R clears legacy page contexts completely; re-enable helper afterward. Only extension-created toolbars affected; no message/depot changes.

### Copy controls 6.3.0.85
Legacy toolbar retirement now checks all extension-marked controls in the document, independent of message ancestry, preserving this controller’s own toolbars. Styles are restored on each scan; controller revision3 replaces prior helpers. No bot restart or permission changes. Owner DOM evidence confirmed an unretired old marker; complete live ancestor structure was not captured.

Copy controls6.3.0.86: automatically appear for recognized reports in Discord Web channels. Two32px icon buttons replace full labels; hover titles and accessible labels identify image/caption actions, green check confirms copy. Errors remain visible, success status remains accessible without expanding row. No popup enable action; update extension and refresh Discord once. Login SPA transition/site-access restrictions can require reload/Chrome site permission. Bot unchanged.

## Operator /find — bot0.2.24
Private Administrator-only /find now leads with status/latest scan and depot details, then history12 scans per page, recipient and delivery evidence. Overview shows known parcel statuses; Parcel N buttons select only that parcel; Overview returns to all. Newer/Older scans edits the same private message without another depot lookup or queue ACK. Delivered/Carded GPS remains historical, not current depot position. POD/GPS are consignment-level and hidden in selected parcel view because schema lacks association. Bay/Sequence only from latest scan; older location stays dated in history.
Navigation retains up to16 snapshots in Mac bot memory for at most14min from originating interaction; clicks do not extend lifetime. Bound to requester/guild/channel and existing Admin gate. Restart/expiry invalidates controls; use /find again. /result recovery gets the same navigation. No export/WhatsApp controls. Overview navigation currently regenerates optional Maps/attachments; no depot action is repeated.

### Find visual follow-up — bot0.2.25 / extension6.3.0.87
Overview has separate parcel summaries and no combined scan history. Selected parcel history uses bold separated scan entries and colored status badges/border; sole parcel opens automatically. Yellow Goods Held, light green Delivered, red failed/Carded, pink Pending. No POD/placeholder in find. Optional map is one scan pin, no geocoding needed; only bound Delivered/Carded coordinates with valid time and no same-time conflicting status/location. Old extension/results lack per-scan coordinates: card still works but map is omitted. Update work-PC dist to6.3.0.87 for maps and to stop find POD requests. /report unchanged.

Find bot0.2.26/extension6.3.0.88 supports red Failed Delivery/Incorrect Address with attempted-delivery GPS. Return to depot is red but does not contribute GPS. /report still uses Delivered/Carded only.

## S09-10 — `/reschedule parcel` (2026-11-04)

Режим увімкнено рішенням G_DISCORD_MODES. Бот (`validation.js`) і executor перевіряють
дату одним `shared/depotCalendar.js` (майбутній робочий день Ірландії, без вихідних і
свят, формат YYYY-MM-DD). Executor спершу робить точний lookup; далі йде лише один
підтверджений consignment з внутрішнім ConsId. «0 matches», «N matches», «no scans» і
відсутній ConsId зупиняють задачу до `depotMain` (виправлено: раніше «no scans» з номером
доходив до depotMain, де давав REVIEW без запису). Dry-run за замовчуванням; live —
лише `dry_run:false`, з повторним читанням і RECHECK перед Save. Повтор/втрачена відповідь
не повторюють запис (S09-04). Тест: `test/queue/executor.test.js` (фіксований годинник).

## S09-11 — `/reschedule barcodes` (2026-11-04)

Режим увімкнено (G_DISCORD_MODES), правила Drive — G_DRIVE_POLICY. Читається лише
налаштована inbox-папка; один запуск розкладає фото й переносить дати підтверджених
посилок, live — лише `dry_run:false`. До плану йдуть тільки номери, підтверджені в
depot; кілька номерів на фото → `unknown` + перевірка, без reschedule (S02-03, S04-02).
Dry-run робить лише GET у Drive і жодного запису в depot (S01-01, S03-04). Live не
використовує список preview: заново читає Drive, depot і робить RECHECK (S03-03…S03-05,
S09-09). Перед кожним PATCH — перевірка змін і колізій (S04-02); втрачена відповідь
звіряється з Drive (S04-04). Обрив задачі Discord лишається `claimed`/uncertain без
повтору (S09-04). Підсумок — у каналі команди (рішення власника). Новий код не потрібен.

## /reply — AI reply proposal (2026-11-05)

`/reply con_id:<number> text:<email text>` (Administrator, ephemeral) reuses the existing FIND task, takes only the Scanning History facts (parcel, type, date, time), masks emails/phones/Eircodes in the email text and asks the local model (Ollama `qwen2.5:7b` on this Mac, `bot/src/aiReply.js`). A deterministic guard rejects replies with a date not in the scans, a 9/14-digit number other than the query/consignment, a delivery promise ("tomorrow", "will be delivered", "guarantee"), an action claim or auto-send wording. Nothing is sent or stored; no queue contract change. Owner decision: EMAIL-VIA-DISCORD in `docs/decisions.md`.
