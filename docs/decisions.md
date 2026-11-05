## RESULT-RECOVERY-2026-10-28 — retention і consignment

Власник погодив 24 години для недоставленого результату та `/result`, але
замість task ID користувач вводить consignment. Після успішного показу —
видалення. Строк від completedAt; expired result не показується, фізичне
очищення при offline bot відкладене до запуску. Це локальна реалізація,
не дозвіл на live registration/deployment. Для batch/multiple results запропоновано optional UX уточнення. Без додаткової
відповіді реалізовано озвучений engineering default: `/result` без номера
показує власні збережені результати, multiple — кнопки вибору, 4 на сторінку.
Це вибір реалізації, не окрема дослівна згода власника. Немає довільного вибору
першого запису; internal UUID лишається технічним ключем, не полем команди.

# Решения и источник истины

## REPORT-CHANNEL-2026-10-26 — відповідь у чаті групи

Власник уточнив: відповідь іде в чат групи, не DM; поки залишити так.
Контекст — /find та майбутній driver report. Поточний /find використовує
Ephemeral, тобто відповідь у чаті бачить лише автор команди. Видимість не
розширювати. Приклад DM failure не описує цей шлях; для нього актуальна
можлива помилка editReply. Окремий наявний barcode DM flow цим уточненням
не змінювався; не переносити його припущення на /find/report.

## POD-FALLBACK-2026-10-26 — відсутнє фото

Власник доручив 404-картинку в тематиці DPD Ireland, мінімалістичну з легким
гумором, коли фото немає. Реалізувати в чинному /find як локальне вкладення;
зберігати основні дані при POD error, справжнє фото має пріоритет. Напис:
Delivery photo unavailable / Photo took a detour. Графіка 404 не означає,
що посилка загублена або API обов'язково відповів HTTP 404.
Це вузьке доручення перед S01-03; не закриває S09-06/07/13. Maps/delivery
обговорені як можливі ризики, але не змінені цим дорученням.

## TEST-SCOPE-2026-10-26 — мінімальні перевірки

Власник просить менше нових тестів, лише потрібні для стійкої роботи.
Не додавати тести заради кількості або дублювання; зберігати чинні регресії.
Test-first лишається для конкретних змін поведінки. Локальний PASS не означає
live перевірку. Аналіз модулів — окреме доручення, не дозвіл на великий рефакторинг.

## AGENTS-2026-10-25 — розподіл і пріоритет report

Власник доручив категоризацію задач, кількох агентів, переносні інструкції,
стислий журнал кроків, прості рішення й зрозумілу діагностику; специфіку DPD
узгоджувати з ним. Окремо підтвердив: пріоритет report і його залежності.
[Розподіл](AGENT_ASSIGNMENTS.md) покриває 54 задачі п'ятьма ролями та integrator.
Кілька read-only reviewers працюють паралельно; у спільній папці один writer.
Це практична реалізація координації, без нового lock-сервісу або зміни state schema.
Нова домовленість розширює попередній режим послідовних чатів паралельним review;
дозволу на одночасний запис у спільні файли чи live-операції не додає.
Першою рекомендовано S09-01; ця сесія налаштовує й перевіряє передачу роботи,
не позначає продуктові задачі розпочатими або виконаними.


## REPORT-2026-10-23 — задача driver report

Власник доручив внести [S09-13](../roadmap/tasks/S09-13.md) у roadmap.
Погоджено: англійська, Discord, компактний формат без історії сканів; дані
доставки, Recorded delivery point і правильна адреса для передоставлення.
WhatsApp поки вручну, без API. Остаточний спосіб виклику/вибору parcel/event
та кнопка Text for WhatsApp не погоджені. Додавання плану не є виконанням
функції або дозволом на live надсилання. Мінімальні risk-based тести — до коду.

## LOCAL-2026-10-23 — інтеграція до чинного checkout

Підтверджено власником у цій сесії: налаштувати проєкт; нові функції — окремо.
Українська — мова співпраці. Гілка `codex`, commit/push у неї дозволені чинним
AGENTS; merge до `main` не дозволено. Ці рішення мають пріоритет над архівом.
Рішення 2026-09-02 про `dry_run:false` збережене: додаткове `confirm_live` або
друге підтвердження preview не додається. Перевірка target/date перед Save
залишається внутрішньою захисною перевіркою.

OWNER-D01/D02 нижче — записи, отримані з архіву. Ручна перевірка Gmail
узгоджується з чинним AGENTS/TOOLING; жоден запис не є новим дозволом на
production, email send, реєстрацію команд або deployment. Інші pending gates
стосуються майбутніх змін і не скасовують вже погоджену поведінку.
Див. [актуальний baseline](audit/LOCAL_BASELINE.md).


> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Дата исходного комплекта: 9 октября 2026 года. Этот файл не объявляет предложенные решения согласованными владельцем.

## 1. Подтверждено поручением владельца

Нужно распаковать и проанализировать `gmail-ai-assistant.zip`, адаптировать структуру разработки по предоставленным образцам, подготовить Copilot/Codex workflow и **сами подробные Markdown-файлы**, работать поэтапно и явно выявлять неясности. Эталон используется как форма документации и организации задач.

Поручение не содержит согласия на смену стека, удаление исходного проекта, production deployment, реальные изменения Drive/depot, чтение личной почты, auto-send, покупку API или обработку клиентских данных AI. На предыдущий вопрос о допустимости существенной перестройки отдельного ответа нет.

## OWNER-D01 — ответы ИИ с обязательной проверкой человеком

**Дата: 9 октября 2026 года. Статус: подтверждено владельцем для текущего этапа разработки.**

Основание — сообщение владельца: «Давай пока чтобы мы его проверяли», в ответ на выбор между ручной проверкой AI-ответов и самостоятельной отправкой. Владелец также обозначил интерес к возможной автоотправке в дальнейшем; это не разрешение включить её сейчас.

**Подтверждённое продуктовое решение:** ИИ готовит ответ на письмо; человек проверяет его до отправки. Автоматическая отправка в текущий этап не входит. Не спрашивать повторно, нужен ли сейчас режим без проверки.

**Инженерная реализация этого решения в плане:** подтверждённые факты → AI proposal → проверка формата и содержания → экран просмотра и редактирования → явное одобрение конкретного текста → создание подтверждённого Gmail draft. Отправку выполняет человек в Gmail. Подтверждение draft не запускает send. Технические детали интерфейса являются проектным решением комплекта, а не дословным требованием владельца.

Одобрение связывается с текущим аккаунтом, исходным message/thread, адресатом, версией текста и проверенным контекстом. Новый ответ модели, правка текста/адресата или обнаруженная смена контекста требуют повторного подтверждения. Флаги модели `needs_human: false` или высокая `confidence` не отменяют обязательную проверку человеком.

**Будущая возможность:** генерация текста отделяется от решения об отправке. Auto-send можно спроектировать отдельным этапом после проверки качества, утверждения допустимых типов писем, предотвращения повторов, ограничений и аварийной остановки. Нет скрытого разрешения, обещания «достаточно включить галочку», даты запуска или предположения о полной автоматизации всех обращений.

**Что не разрешено этим решением:** чтение реальной почты в текущей сессии, создание реальных drafts, доступ к клиентским данным, передача их AI, покупка API-квоты, изменение depot/Drive и production rollout. G_AI_PROVIDER, G_PRIVACY, G_TEST_ACCOUNTS и G_RELEASE остаются отдельными допусками.

**G_GMAIL_POLICY закрыт только частично:** режим ручной проверки выбран; категории писем, исключения, язык, адресаты/Reply-To, lifecycle labels и внешние допуски ещё не определены. Поэтому gate остаётся `pending`, а не `approved`.

**Затронутый план:** S05-04/S05-05, S06-01…S06-05, S07-01 и S08-03. S06-05 отдельно проверяет связку AI proposal → human review → Gmail draft. Все application tasks остаются `todo`.

## 2. Наблюдаемые факты, не продуктовые решения

Последний источник — `gmail-ai-assistant-main.zip`: Chrome MV3 + Node Discord bot + Firestore tasks/todos + offscreen listener и worker executor. CAD/depot/Drive и начальный Gmail flow сохранены; активного AI transport нет. Существуют root test script и четыре security tests. Подробности — [GITHUB_BASELINE](audit/GITHUB_BASELINE.md); [BASELINE](audit/BASELINE.md) первого ZIP исторический.

Существующий код может содержать ошибку. В частности, Drive Dry Run создаёт папки. Наличие `DELIVERED/OFD → CHANGE_DATE`, PDF417 priority или `createdTime.slice(0,10)` показывает текущую реализацию, но не делает её согласованной бизнес-политикой.

## 3. Предложенные инженерные defaults этого комплекта

| ID | Предлагаемый подход | Причина и граница |
|---|---|---|
| D01 | Сохранить Chrome MV3/ES modules/esbuild, имеющийся Node Discord bot и Firestore | Минимальная безопасная модернизация до решения G_ARCHITECTURE |
| D02 | Node-based roadmap/validators | Не вводить Python только ради имени инструмента из эталона |
| D03 | Одна карточка — одно проверяемое изменение | Упростить regression/review и передачу состояния |
| D04 | Synthetic fixtures по умолчанию | Не превращать анализ кода в обработку клиентских данных |
| D05 | Preview не выполняет бизнес-мутации | Прямое соответствие ожиданию безопасного dry-run, подтверждённый дефект F01 |
| D06 | Ручная проверка AI-ответа и draft-only | Режим подтверждён OWNER-D01; детали политики и внешнее использование по-прежнему требуют G_GMAIL_POLICY и остальных допусков |
| D07 | Один writer на folder/checkout | До реализации координации несколько writer не разрешаются автоматически |
| D08 | Explicit unknown/ambiguous/uncertain | Недостаток данных не маскируется успехом |
| D09 | Никаких active model/budget presets | Возможности зависят от аккаунта, agent harness и установленной версии |
| D10 | Неактивные JSON/TOML examples | Сохраняются пользовательские настройки; применение проверяется отдельно |

Изменять defaults можно через небольшую ADR-запись: проблема, варианты, решение, последствия, проверка и миграция. Нельзя описывать ADR как дословное решение владельца, если он его не принимал.

## 4. Приоритет при конфликте

Последнее явное поручение владельца задаёт scope. Подтверждённая product policy важнее предложенного default. Карточка и контракт уточняют требования внутри scope. Код и тесты показывают фактическое поведение. Исторические README/TOOLING/эталон не перекрывают актуальный факт или новое решение.

Если контракт и карточка расходятся, записать конкретное противоречие и остановить только затронутую часть. Если current code не соответствует требованию — создать/выполнить defect test. Не переписывать требование втайне ради GREEN.

## 5. Как добавлять решение

Запись: ID, дата, кто/каким поручением подтвердил, точная формулировка, scope, затронутые карточки, проверяемые последствия, срок/условие пересмотра. Не включать secret values. Закрытие gate в `.workflow/state.json` должно ссылаться на решение и evidence допуска.

## 6. Что не спрашивать повторно

Нужны подробные MD и поэтапный workflow по образцу; это существующий DPD-проект; документация на русском; для текущего AI/email этапа выбрана обязательная ручная проверка по OWNER-D01. Остальное не считать согласованным только из-за текста другого приложения. Открытые вопросы собраны один раз в [QUESTIONS_RU.md](../QUESTIONS_RU.md).

## OWNER-D02 — Discord включён в документацию и план

9 октября 2026: владелец поручил включить функционал найденного бота в MD. Канонический scope — [OWNER_DECISION_DISCORD_RU](../OWNER_DECISION_DISCORD_RU.md). Bot/Firestore/queue — подтверждённые кодом существующие компоненты, не вариант будущего стека. Поручение документации не разрешает регистрацию, deployment, live-команды или пересылку писем Discord.

S09 — инженерная декомпозиция проверки/развития. Неподключённые режимы вынесены в условные S09-10/S09-11. G_DISCORD_ACCESS касается конкретных сред/прав/данных, G_DISCORD_MODES — допустимости включения этих режимов. Оба pending. Не спрашивать снова, есть ли бот и нужно ли его учитывать; это уже решено.

Авторизация будущего email review в Discord и проактивных сообщений не подтверждена. OWNER-D01 продолжает действовать независимо от транспорта интерфейса. Не считать успешную команду /todo или depot live confirmation разрешением email send.

## COMMAND-SHAPE-2026-10-29 — відкладене узгодження

Власник запропонував `/find <consignment>`, `/reschedule <consignment> <date>`,
`/result <consignment>`. Запит про долю existing all/barcodes/retry лишився
без відповіді; подальше «що далі» й доручення S09-06 не завершують цю зміну.
Чинні команди/optional result list тимчасово збережені; не записувати їх як
остаточно погоджений UX і не змінювати в S09-06.

## COMMAND-SHAPE-2026-11-01 — уточнення власника

Власник: команду змінювати не потрібно; потрібні аргументи для перенесення
однієї посилки на обрану ним дату в робочий день. Зберігаємо наявний
`/reschedule parcel con_id:<consignment> new_date:<YYYY-MM-DD>` та інші режими.
Ці required arguments уже є в коді. Default dry_run:true; explicit false — live.
Чинні bot/executor validators відхиляють невалідну, минулу/сьогоднішню дату
та суботу/неділю. Чи виключати також Irish bank holidays для ручної дати —
потребує уточнення; не плутати з наявним automatic next-working-day.
Це закриває відкладене перейменування/спрощення reschedule з рішення
COMMAND-SHAPE-2026-10-29; не є окремим рішенням щодо optional /result list.
Runtime не змінено; live не запускався.

## REPORT-ENTRY-2026-11-02 — owner approved

Separate `/report con_id:<number>`; keep /find full card. When multiple physical
parcels/events qualify, explicit operator selection before report. Only Delivered
and Carded location evidence; Carded is attempted delivery, never assumed parcel
collection location. First implementation direct Maps URLs, no enrichment calls;
S09-07 remains open for /find. English private report, full plain URLs for manual
copy; photo separately. No live registration/start authorized by this implementation.

## AUTONOMOUS-SMALL-TASKS-2026-11-03 — owner approved

Owner authorizes small independent roadmap tasks without repeated approval,
one verified task at a time, with shared journal, commit and push to codex.
Consult on unresolved DPD behavior or material product choices. This does not
activate services, register commands, deploy or merge main automatically.

## REPORT-DESTINATION-2026-11-03 — implemented offline in S09-14

Optional /report eircode overrides the system Eircode for this report only.
If omitted, use the system Eircode; if absent/invalid (e.g. placeholder), request
a correct one. No depot mutation. Agreed driver layout: recipient/address/phone/
time, separate current-location navigation to recorded pickup and correct delivery,
map with both points, POD. Preserve exact event selection and distinguish Carded
attempts from parcel collection. Implementation is locally verified; activation remains pending;
WhatsApp clipboard/export interaction is still a proposal, not completed behavior.

## REPORT-WHATSAPP-2026-11-03 — owner approved, S09-15
Owner wants no manual text cleanup and all photos together, visible directly in WhatsApp chat; no PDF. /report automatically produces one map+POD JPEG and plain English caption with full navigation URLs. This removes the extra preparation button/state. Operator-only manual-Eircode note removed at owner request; override still affects report only, depot street address unchanged. No WhatsApp sending/API or clipboard access. Manual transfer: save one image, Copy Text, paste as its WhatsApp caption. Long reports retain full .txt export; arbitrary long captions/mobile rendering are not guaranteed.
Previous /report pilot: owner says it appears to work; not evidence for every edge case. Bot always runs on Mac, extension on work PC. Existing explicit restart authorization applies to this trial; no command registration/schema change required.

## Report layout follow-up — 2026-11-03
Owner requested map left/POD right in one image, dark background and exact legend: red scanned point · blue delivery address. S09-15 follow-up uses1600x864 canvas, two792px contain panels with16px gap and72px header. No crop or change to caption/navigation. Supersedes vertical layout; no command/extension changes.

## RESPONSE-CLEANUP-2026-11-03 — owner approved
All new bot replies: ephemeral delete14min from interaction creation (Discord token15min limit); ordinary channel replies/DM delete30min after send. Edits do not extend deadline. No prior-message purge or change to private access. Memory timers best-effort, lost on restart; no interaction credentials persisted. This UI cleanup is independent of24h undelivered result recovery. Successfully ACKed results do not reappear in /result after auto-delete. Owner confirmed14/30 split after limitation explained.

## REPORT-COPY-2026-11-03 — two-button workflow verified by owner
Owner uses WhatsApp Web on work PC. Combined image/text clipboard probe showed an image; two-button synthetic local page confirmed working by owner. S09-17 integrates that workflow as open-for-whatsapp.html attached to ready /report. Download/open in Chrome, copy image/paste, then copy caption/paste into image caption. No native Discord clipboard button, no hosting/WhatsApp API/direct send. Existing direct report image/text remain. Local downloaded PII file survives Discord cleanup.

## DISCORD-COPY-EXTENSION-2026-11-03 — owner approved
Owner wants copy buttons directly beside report in Discord Web, without HTML downloads; approved Chrome extension approach. Explicit activation via popup on active discord.com/channels tab, activeTab+clipboardWrite; no permanent Discord origin grant or clipboardRead. Buttons copy image then caption separately, no WhatsApp automation. Refresh requires reactivation. Desktop Discord unsupported. Existing HTML export stays fallback for long reports or unsupported DOM/CORS.

### WhatsApp caption styling — 2026-11-03
Owner confirmed preserving report text styling/emojis when pasted into WhatsApp. One pure shared/whatsappCaption.js formatter adds WhatsApp single-asterisk bold to known headings/labels, preserves values, newlines and full URLs. Used by extension Copy Caption and bot HTML export; native Discord report remains plain. Extension extracts emoji IMG alt and BR/text nodes rather than losing emoji via innerText. Shared module ships with repository for Node bot and is bundled into extension, no browser/runtime dependency. Existing downloaded HTML is unchanged; generate a new report.

### HTML export removed — owner decision 2026-11-03
Owner requested no generated HTML attachment. /report now returns image and caption only, plus existing .txt fallback for unusually long reports. open-for-whatsapp.html generation/module retired; S09-17 remains historical completed work, superseded by this decision. Discord Web extension copy buttons and WhatsApp caption formatter remain; extension version unchanged6.3.0.83. Previously downloaded HTML/files and already sent messages are not removed.

Owner decision2026-11-03: automatic Discord report copy controls and compact icon buttons approved. Supersedes manual popup activation; persistent content-script access limited to Discord channels URLs. Clipboard copy remains explicit per click; no WhatsApp automation. Owner also confirmed prior duplicate buttons resolved after refreshing tab.

## Operator find — owner approved 2026-11-03
/find is a private operator/depot investigation card, not a driver export. Order: status/latest event, parcel details, newest-first paged scan history, recipient, historical delivery evidence. Explicit parcel navigation; /report remains driver-facing. Bay/Sequence only describes latest recorded scan, never carries an older bay forward. No barcode inferred from query/parcel number. Observed parcel count is not a confirmed total. Current schema cannot bind global POD/GPS to physical parcel: overview labels this; selected view suppresses media. Unassigned scans keep latest status unconfirmed even after selection.

## Find visual separation — owner approved 2026-11-03
Overview lists parcel statuses without merged history. Selecting a physical parcel shows only its scans; a sole parcel opens directly. Scan entries use separated paragraphs, bold timestamps/status and badges: Goods Held yellow, Delivered light green, Failed Delivered/Carded red, Pending pink. POD and missing-photo placeholder removed from find; report keeps POD. Map shows only latest unambiguous valid Delivered/Carded scan of selected parcel, with historical/attempt disclaimer; no global drop fallback.

## Find failed-attempt scans and merge authorization — 2026-11-03
Owner confirmed exact statuses Incorrect Address and Return to depot and requested implementation, commit and merge. Find allows GPS for Delivered, Carded, Failed Delivery, Incorrect Address; all except Delivered are labelled attempted delivery, no parcel-presence claim. Return to depot means driver returned parcel to depot: red badge, no attempt GPS from that scan. Report eligibility unchanged. Explicit owner authorization supersedes default no-main-merge restriction for this codex integration.

## CALENDAR-2026-11-03

Власник підтвердив Europe/Dublin незалежно від timezone пристрою; автоматично
обирається наступний робочий день без cut-off. Для automatic і manual виключаємо
суботу, неділю, всі public holidays та банківські вихідні Республіки Ірландія.
Інженерне джерело: BPFI Bank Holidays 2025–2027, перевірено 2026-11-03:
https://bpfi.ie/wp-content/uploads/2025/10/Bank-Holidays-2025-2027-1.pdf
Включає Good Friday та додаткові Christmas bank closures (2026: 28–29 грудня;
2027: 27–29 грудня). Це погоджений операційний фільтр, не опис трудових прав.
Реалізація обмежена перевіреними 2026–2027 роками; невідомий календар зупиняє
операцію. Новий рік потребує перевірки джерела й оновлення версії даних.
Довільні локальні закриття depot не вигадуємо. Погодження не змінює статусну
policy/logCall і не дозволяє live-пілот. Work-PC недоступний.

## DEPOT-POLICY-2026-11-04 — partial owner clarification

Owner: a consignment-level DELIVERED/OFD does not alone determine eligibility.
Example: parcels1/2 went OFD then Delivered, parcel3 stayed in depot; the remaining
physical parcel is the reason to reschedule. Owner describes CAD scan or an
undelivered parcel physically in depot; absence of Delivered alone is not yet a
confirmed proof of depot presence. Exact scan evidence/recency still needs clarification.
GOODS HELD: Notes recording a delivery-date change TO TODAY permits transfer to
the next working day under the approved Irish calendar. No requirement that the
note itself was created today or yesterday was stated.
Owner asks what existing Log Call does; no removal/mandatory/best-effort decision
yet. Source inspection: it attempts form POST, onclick URL or fallback endpoint;
no button means no call; response status/body are not checked; thrown errors are
warned and reschedule continues. This is code behavior, not an observed live failure.
Current date-save form is addressed by consignment ConsId with no physical parcel
selector. Do not claim parcel-specific mutation without depot evidence. G_DEPOT_POLICY
remains pending; runtime unchanged. Manual parcel command retains chosen-date
semantics unless owner explicitly changes it.

### DEPOT-POLICY-2026-11-04 — series scope and CAD clarification

Owner confirms a delivery-date change applies to the entire consignment/series;
a single physical parcel cannot receive its own date. Latest stated eligibility:
Pending/Goods Held status AND a CAD scan today (Irish day). This is an explicit
owner rule, not an inference from the current code. Still clarify whether the
previous aggregate Delivered/OFD example is an exception to this status list,
and whether the earlier GH Notes TO TODAY condition remains additional.
Log Call decision remains unanswered; no behavior change or gate completion.

## DEPOT-POLICY-IMPLEMENT-2026-11-04

Owner explicitly authorized implementation after confirming this table:
- PENDING + today's CAD scan.
- PENDING + Cancelled out for delivery on a physical parcel which has NEVER had
  Return to depot (before or after cancellation). Other parcels' return scans
  do not count against that parcel.
- GOODS HELD + Notes confirming a date change TO TODAY; no CAD requirement.
- OFD/DELIVERED + a physical parcel remains in depot and has today's CAD scan.
Dates refer to Europe/Dublin. Mutation changes the entire consignment; manual
parcel retains selected date, automatic modes use next working day. Later OFD
or delivery on the same parcel invalidates an earlier CAD as presence evidence.
LogCall existing best-effort behavior is preserved, not redesigned in this task.
Unknown/malformed/ambiguous evidence stops automation and explains the reason.
This supersedes the earlier partial Pending/GH-only interpretation; CAD route in
Pending List alone is not proof. Candidate list remains the current depot list;
non-CAD rows must be checked too to support the cancelled/GH branches.

## LOGCALL-REMOVE-2026-11-04 — owner approved

Owner explicitly requested removal of the separate Log Call step after discussing
manual Log Call → Reschedule → Save versus direct form submission. Runtime
reschedule now only obtains the rearrange form and POSTs its preserved fields
plus the selected arranged-date/Save values. Removed logCall helper and all three
fallback strategies; no replacement request. Identity/calendar/eligibility and
server confirmation checks remain. This supersedes the prior S03-03 decision to
preserve best-effort LogCall. Local tests are not proof of the live server's
prerequisites; work-PC smoke remains pending. Historical snippets are not runtime
entrypoints and still describe their original behavior.

## RESCHEDULE-CONSOLE-2026-11-04

Owner requests visible console output during extension reschedule. Implement
bounded event-based lifecycle messages in depot MAIN console, shared by popup and
Discord-triggered execution: start/date/count; per-batch index check/form/recheck/
POST/confirmed save, dry-run would-change, skip/review/error and final counts.
No raw status/Notes/IDs/customer data/session URLs/bodies. No polling chatter or
new outbound logger. Console progress does not change the approved status/date
policy, confirmation criteria, direct form flow, or removed LogCall decision.

### 2026-11-04 — Reschedule result visibility
Owner requests per-item extension-console outcomes and paged Discord output after reporting no date changes. Existing MAIN phase logs remain; final safe indexed outcomes also appear in extension caller Console. Private Discord snapshot pages preserve bounded full results; barcode DM uses a full text attachment. No policy changes or live replay. The actual depot failure remains unidentified until a new result is observed. Activate bot0.2.29 before installing extension6.3.0.93 due to the new optional result envelope.

### 2026-11-04 — Owner-approved con_id console outcomes
Owner explicitly requests con_id followed by emoji result. This overrides the prior no-tracking-identifiers console rule only for the public consignment number in reschedule outcome lines. Validate8/9/14digits; never print internal ConsId, Notes, customer data, session or raw provider fields. Confirmed save uses ✅ Перенесено, dry-run uses 🔎 Буде перенесено, skips/errors/review remain distinct. Both depot MAIN and extension final mirror show it.

### 2026-11-04 — Pending CAD administrative creation row
Owner supplied a live example of Pending with creation row Par#0 followed by physical parcel1 received/CAD today. Reproduced false review in synthetic fixture. Ignore only normalized exact Order received at Par#0 after timestamp validation; it supplies no eligibility evidence. Physical parcel latest-CAD policy and unknown/return/delivery identity guards remain. Scheduled target stays next Irish working day. No original screenshot/customer/session/tracking fields retained.

### 2026-11-04 — Skip administrative Par#0 completely
Owner reports persistent Pending scan REVIEW and explicitly instructs to skip the administrative row without checking it. Supersedes the earlier exact Order received title/timestamp condition: Par#0 rows are now excluded before type/date/time parsing. Physical parcels1+ retain identity, timestamp, latest-movement and return policy. Date/time text accepts an adjacent fixed-width boundary because HTML br need not contribute whitespace to textContent. Batch source remains the existing Pending list; target remains next working day. Actual live failure cause beyond these reproduced parser gaps is not yet verified.

### 2026-11-04 — NearRoute and mixed two-parcel series
Owner permits NearRoute and reiterates that one parcel OFD plus another remaining in depot with CAD permits changing the entire series. NearRoute is accepted case-insensitively as latest physical-parcel evidence today, parallel to CAD; stale or superseded NearRoute does not permit a write. Existing Pending-list source, next-working-day calendar, whole-series write and fresh evidence recheck remain. Goods Held retains its specific note-to-today rule.

### 2026-11-04 — NearRoute is a scan-row route code
Owner screenshot establishes that NearRoute appears in Route, while Scan Type Desc begins Nearest Route. Previous implementation incorrectly matched only type NearRoute. Scan parser now reads Route; exact normalized route NearRoute paired with exact confirmed description Nearest Route Assigned is classified as the approved event. Known OFD/Delivered and unknown descriptions cannot be hidden by that route. Latest/today/physical identity and whole-series rules unchanged; exact type NearRoute compatibility retained.

Owner then confirmed the full tooltip exactly: Nearest Route Assigned. Replaced the rejected prefix approach with exact normalized matching; cancelled/out-for-delivery suffixes remain review.

### 2026-11-04 — Reschedule form date reconcile (S03-05)
Owner checked the depot rearrange form for a parcel without a same-day change: the arranged-date field shows today's date. The target is always a later working day, so the default can never equal it. Before RECHECK/POST the extension now skips the POST when the enabled arranged-date already equals the target and reports SKIP «Already arranged for the target date; nothing sent» (retry treats it as completed). Lost POST responses stay «outcome uncertain». No live replay.

### 2026-11-04 — Discord readability and status palette
Owner asked for bot messages that read comfortably on desktop and phone: more spacing, moderate on-topic emoji, and a colour per kind of parcel status. Approved palette (badge + embed colour): 🟩 Delivered; 🟦 Out for delivery; 🟪 CAD scan / Nearest Route; 🟨 Goods Held; 🟧 plan changed (Optimize For Next Day, Cancelled out for delivery, Redirected, Rescheduled); 🟥 problem (Failed, Carded, Incorrect Address, Undelivered, Return(ed) to depot); 🩷 Pending; 🟫 hub/transit (Received into, Long lengths, In transit, HUB); ⬛ Order received; ⬜ unknown. /find fields get emoji labels and a zero-width spacer line; reschedule/plain replies split the one-line summary into labelled lines and show parcel rows as text instead of a sideways-scrolling code block, falling back to the compact block when the spaced text would exceed 2000 characters. Card language stays English; data, counts and privacy rules unchanged.

### 2026-11-04 — "Cancelled OFD scan" is the depot's cancelled-OFD event
Live parcel (Pending, CAD scan today, then two cancelled OFD scans) was not rescheduled: the tooltip text "Cancelled OFD scan" was unknown, so the latest scan went to REVIEW. Owner: a new Pending parcel with CAD today must be rescheduled no matter how many cancelled OFD scans follow. Exact normalized "cancelled ofd scan" now maps to the existing cancelled-OFD rule (Pending, no later return/delivery/out-for-delivery → next working day). Other descriptions still go to review. policyVersion IE-reschedule-2026-11-04.2. Synthetic regression mirrors the live history without identifiers.

### G-DISCORD-MODES-2026-11-04 — owner approved
Owner explicitly keeps the existing Discord `/reschedule parcel` and `/reschedule barcodes` modes enabled as they work today: default dry-run, live only with explicit `dry_run:false`, no second confirmation. This approves G_DISCORD_MODES for S09-10/S09-11 hardening; it is not a live-pilot or access approval (G_DISCORD_ACCESS/G_TEST_ACCOUNTS stay pending).

### G-DRIVE-POLICY-2026-11-04 — owner approved
Owner chose the Drive label filing rules: (1) the filing date (name prefix and YYYY/MM folder) is the Drive upload time (`createdTime`) converted to the Irish calendar day (Europe/Dublin), not the UTC prefix; (2) a photo with several different consignment numbers is named `unknown`, flagged for review and never used for a reschedule target; (3) on a re-run, a file already named in our format keeps its name only if the freshly read and depot-verified number matches; otherwise it is left untouched and flagged for review (no rename); (4) a missing or invalid upload time leaves the photo untouched with an explicit error. Existing patterns `YYYY-MM-DD_number[-pNN][-N].ext` and `YYYY-MM-DD_unknown-NNN.ext` stay. This is not approval to run against the production Drive folder (S04-05 still needs G_TEST_ACCOUNTS/G_PRIVACY).

### G-DRIVE-POLICY-NAMING-2026-11-04 — owner amendment
Owner changed the label file name to number first with the parcel always present: `123456789_p01_2026-11-04.jpg` (parcel 2 → `_p02_`, second photo → `…_2026-11-04-2.jpg`, unreadable → `unknown-007_2026-11-04.jpg`). If the barcode carries no parcel number the `_pNN` segment is omitted rather than guessed (`123456789_2026-11-04.jpg`). The date part keeps the Irish upload day. Files already named in the earlier date-first format are not renamed and are still recognised on re-runs (same match-or-review rule); unknown numbering continues across both formats. Drive policy version `drive-labels-2026-11-04.2`.

### G-ARCHITECTURE-2026-11-04 — owner approved (ADR for S04-03)
Context: the popup's Scan Drive Labels runs inside the popup document; closing the popup stops the batch mid-way. Discord `barcodes` already runs in the offscreen document (DOM + canvas for ZXing), serialised with all queue tasks. Decision (option A): one runner. The popup only starts a job and shows its state; background validates that the start request comes from the popup, creates a job record in `chrome.storage.local` and forwards it to offscreen; offscreen runs the same `executeBarcodeTask` inside its serial queue (never in parallel with Discord tasks) and reports PII-free progress and the final summary back to background, which updates the job record. The popup shows progress and the summary/details (no per-photo lines, owner choice). Decoding stays in offscreen (DOM/canvas), never the service worker. If offscreen restarts while a job is active, the job is marked interrupted and is not resumed or replayed automatically. Messages are validated by type and browser-provided sender; depot pages cannot start jobs or obtain Google tokens. No new manifest permissions; extension identity unchanged. Alternatives rejected: B (remember progress only — still stops on close), C (separate extension tab — another UI that can still be closed).

### 2026-11-04 — Barcode report in the group channel, grouped and with emoji
Owner: the final `/reschedule barcodes` report (and its error) is posted in the channel where the command was used, never sent as a DM; this supersedes the earlier DM delivery. The report shows only non-zero counts with emoji and lists parcels grouped by outcome (✅ перенесено / ⚠️ перевірка / ❌ помилки / ⏭️ пропущено). If the text would exceed 2000 characters it is split into several consecutive channel messages; no file is attached (owner). Consignment numbers and depot statuses appear in the channel by owner choice; recipient data is never included.

### 2026-11-04 — S04-05 runs in the working Drive folder (owner risk acceptance)
Owner has no separate test folder and explicitly chose to run the S04-05 Drive verification in the configured working folder, including live mode, accepting that recognised parcels may be rescheduled in the depot. Order: dry run first, live only after the dry-run result is reviewed. The folder id is not recorded in the repository. This approval covers the S04-05 run only; it is not general approval for other live pilots (S09-12/S08).

### G-GMAIL-POLICY-2026-11-04 — owner approved
Drafts only, never sent automatically (OWNER-D01 unchanged). Source: only messages the owner labels `AI-Reply`. Language: English. Recipient: the sender, or its single Reply-To address; no CC/reply-all. Ignored without a draft (labelled for review): no-reply/mailer-daemon/postmaster senders, automated mail (Auto-Submitted other than `no`, List-Id, Precedence bulk/list/junk), and messages without a consignment number. A message about several consignments gets one draft with facts for each, flagged for review. The draft states only depot facts (status, scheduled date already in the depot); it never promises a date, compensation or an action, and a draft never grants permission to change a delivery date or labels.

### 2026-11-04 — Gmail write scope for drafts (S05-05)
Owner approved write access to Gmail for reply drafts and labels. The manifest scope `gmail.readonly` is replaced by `gmail.modify` (covers reading, drafts and labels; Google has no draft-only scope). Sending is never called: `src/gmail/drafts.js` uses only drafts.create, threads.get and messages.modify, and its test fails on any send endpoint. Chrome asks the owner to re-approve Google access once. Draft text is a facts-only English template until an AI provider is chosen (S06); later drafts may learn from the owner's edits (owner idea, S06).

## AI evaluation thresholds 2026-11-05 — owner approved

S06-03 synthetic evaluation: critical violations = 0 and case pass rate ≥ 0.9. Any critical fails the suite. Not to be lowered without a new owner decision.

## G_AI_PROVIDER 2026-11-05 — owner approved

Provider: a local model on the owner's always-on Mac (M1 Pro, 16 GB) via Ollama; 7–8B class model (candidate `qwen2.5:7b` or `llama3.1:8b`, final tag fixed in S06-01 after the synthetic evaluation). Budget $0, no cloud API, no API key. The owner considered paid OpenAI API (a ChatGPT subscription does not cover API) and Gemini free tier (free-tier data may be used by Google) and chose local for cost and privacy. Switching provider later is a single adapter change plus a new decision. Not yet installed; installing Ollama/model is a separate owner-approved step.

## G_PRIVACY 2026-11-05 — owner approved

The AI may receive only the email text and grounded depot facts (Scanning History). Customer address, phone and email are not sent; email addresses, phone numbers and address-like lines are masked in the email text before the prompt is built. With the local provider nothing leaves the Mac. Drafts still require human review; no auto-send.

## EMAIL-VIA-DISCORD 2026-11-05 — owner approved

The owner works through Discord. The depot22 mailbox and the depot tab live on a separate work PC; the bot and Ollama run on the always-on Mac.

- Flow: work-PC extension reads AI-Reply mail (Gmail API) → depot lookup → masks emails/phones/addresses → Firestore task → bot on the Mac calls the local model and validates the proposal (S06-02) → private admin-only Discord channel shows masked email text, consignment, scans and the proposed reply → owner decides per email.
- Discord buttons: ✅ draft, ✏️ edit, 🔁 regenerate, ⏭ skip, 📤 send. **Send is an explicit per-email owner action**, never automatic; one click = one email. Sending is executed by the work-PC extension (`gmail.modify` already covers send); an indeterminate send is reported as uncertain and never replayed.
- This amends §8 of `docs/ai-boundary.md` (the bot becomes the AI transport for masked prompts) and the earlier "draft only" rule of G_GMAIL_POLICY. Masked email text and AI replies may pass through Firestore and the private Discord channel; nothing is posted to public channels or logs.
- Requires new queue task types (contract version bump in both mirrors and rules) and the work PC running Chrome with the extension.

## MAIL-IN-DISCORD 2026-11-05 — owner approved

Owner wants depot22 mail visible in Discord. Approved: every unread Inbox message (last 3 days) without the `AI-Read` label is posted once to the private channel `#emails-📩` with sender, subject, detected consignment number(s) and a preview; contacts are shown as-is (private, owner-only channel). Buttons: 📖 read full text (ephemeral), ✉️ AI reply (same grounded proposal as `/reply`, only with exactly one number), ✅ handled → adds Gmail label `AI-Read` (owner chose a label instead of marking as read). `/mail` checks now and lists open mail. The extension never sends, deletes or marks mail as read; the bot keeps a 7-day local cache (`bot/data/`, gitignored). Polling every 2 minutes through the existing task queue; results ride in the terminal `parcel` map, so no Firestore rules deployment.
