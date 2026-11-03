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
