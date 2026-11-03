# Повний перегляд roadmap — 2026-11-03

Статус після автономного проходу: **29 із 55 задач done; 26 відкладено**.
Переглянуто всі 54 початкові картки; додано S09-14 для вже погодженого доповнення report.
12 задач завершено в цьому проході (11 початкових + S09-14), кожна окремим commit/push у `codex`.
Done означає виконану локальну прийомку картки, а не production verification.
`node tools/roadmap.mjs next` повертає `no_ready_task`. Це стан поточного графа й погоджень, не твердження про відсутність будь-яких майбутніх покращень.

## Етапи

| Етап | Done / усього | Завершені картки |
|---|---:|---|
| S00 — Принятие проекта и инструменты | 4/5 | S00-01, S00-02, S00-03, S00-04 |
| S01 — Приоритетные защитные исправления | 5/5 | S01-01, S01-02, S01-03, S01-04, S01-05 |
| S02 — Идентификаторы, неоднозначность и именование | 3/4 | S02-01, S02-02, S02-04 |
| S03 — Проверяемые depot действия | 1/5 | S03-01 |
| S04 — Надёжная пакетная обработка Drive | 1/5 | S04-01 |
| S05 — Gmail от очереди до подтверждённого draft | 3/5 | S05-01, S05-02, S05-03 |
| S06 — Контролируемый AI | 1/5 | S06-02 |
| S07 — Понятный и устойчивый интерфейс | 1/3 | S07-02 |
| S08 — Браузерная проверка и согласованный выпуск | 0/4 | — |
| S09 — Discord-бот и общая очередь Firestore | 10/14 | S09-01, S09-02, S09-03, S09-04, S09-05, S09-06, S09-07, S09-08, S09-13, S09-14 |

## Зроблено в цьому проході

| Task | Commit | Результат |
|---|---|---|
| [S02-01](../roadmap/tasks/S02-01.md) | `5bbbc36` | Строгі межі підтриманих barcode форматів. |
| [S02-02](../roadmap/tasks/S02-02.md) | `1000ca0` | Неоднозначні фізичні посилки зупиняють filing до ефектів. |
| [S05-01](../roadmap/tasks/S05-01.md) | `3c698cd` | Gmail pagination, dedup, ліміти та явний partial результат. |
| [S04-01](../roadmap/tasks/S04-01.md) | `2af9e21` | Перевірка folder scope, bounded enumeration та пропуск непідтриманих файлів. |
| [S09-03](../roadmap/tasks/S09-03.md) | `2c9289e` | Реальні emulator перевірки Firestore rules; виправлено cancellation summary validation. |
| [S05-02](../roadmap/tasks/S05-02.md) | `a694ccd` | Обмежений MIME/plain-text reader; HTML-only/charset/attachments не стають довіреним текстом. |
| [S05-03](../roadmap/tasks/S05-03.md) | `dd13a44` | Case context: підтверджений зв’язок автора, точний lookup, джерело і freshness. |
| [S07-02](../roadmap/tasks/S07-02.md) | `3af1b97` | Правдиві capability стани; ключ не означає працюючий AI, непогоджені Gmail mutations заблоковані. |
| [S09-08](../roadmap/tasks/S09-08.md) | `5396228` | Todo: стабільний вибір, ownership, транзакції та чесний partial clear. |
| [S09-05](../roadmap/tasks/S09-05.md) | `b52e0d4` | Runtime sender і UID-bound listener; без сліпого повторення claimed роботи. |
| [S06-02](../roadmap/tasks/S06-02.md) | `c0fc7f1` | Строгий AI proposal contract; без provider/tools/IO, завжди ручна перевірка. |
| [S09-14](../roadmap/tasks/S09-14.md) | `b98facc` | Report: optional Eircode, два current-location links, optional map/POD і fallback. |

Для кожної задачі є `.workflow/evidence/<TASK>.json` і стислий запис у WORKLOG.
Review/ізольовані реалізації: roadmap_drive_audit, roadmap_mail_audit, roadmap_discord_audit; лише root інтегрував спільні файли, state, locks і журнал.

## Відкладено — точна причина для кожної картки

Прямі рішення власника та залежні від них роботи розділені в поясненнях нижче.
Не вважати відкладені задачі виконаними й не розблоковувати gates припущенням.

| Task | Що потрібне перед реалізацією/завершенням |
|---|---|
| [S00-05](../roadmap/tasks/S00-05.md) | Підтвердити фактичне підхоплення інструкцій у вибраній IDE/новій сесії. Читання skill у цій сесії не доводить discovery в Copilot. |
| [S02-03](../roadmap/tasks/S02-03.md) | Обрати джерело дати для Drive filing, часовий пояс, поведінку existing names та unknown/ambiguous. |
| [S03-02](../roadmap/tasks/S03-02.md) | Уточнити календар: часовий пояс, cut-off, bank holidays. Робочі дні вже погоджено; не перепитувати це загалом. |
| [S03-03](../roadmap/tasks/S03-03.md) | Узгодити дозволені дії для PENDING / DELIVERED / OFD / GOODS HELD та інших depot статусів. |
| [S03-04](../roadmap/tasks/S03-04.md) | Залежить від календаря S03-02 і правил статусів S03-03; повний preview не може вигадувати eligibility. |
| [S03-05](../roadmap/tasks/S03-05.md) | Залежить від S03-04; визначити потрібність/порядок logCall і допустимі поля. Live consent лишається dry_run:false. |
| [S04-02](../roadmap/tasks/S04-02.md) | Залежить від S02-03: правила іменування, конфліктів і застарілого filing plan. |
| [S04-03](../roadmap/tasks/S04-03.md) | Залежить від S04-02; погодити простий durable runner та допустиму глибину архітектурних змін. |
| [S04-04](../roadmap/tasks/S04-04.md) | Після S04-03: durable journal, cancel і reconciliation мають відповідати обраному runner. |
| [S04-05](../roadmap/tasks/S04-05.md) | Після S04-04: погоджена тестова Drive папка та дозволений реальний roundtrip, дані й доступ. |
| [S05-04](../roadmap/tasks/S05-04.md) | Узгодити recipients/Reply-To/reply-all, мову, exclusions і labels. Ручна перевірка відповіді вже погоджена. |
| [S05-05](../roadmap/tasks/S05-05.md) | Залежить від S05-04: створення draft потребує окремо погодженого workflow і OAuth scope; поточний scope read-only. |
| [S06-01](../roadmap/tasks/S06-01.md) | Обрати AI provider/model, дозволені дані, мету та бюджет. |
| [S06-03](../roadmap/tasks/S06-03.md) | Еталонні результати evaluation залежать від reply policy S05-04. |
| [S06-04](../roadmap/tasks/S06-04.md) | Після S06-01/S06-03: дозволений AI shadow, dataset, privacy і бюджет. |
| [S06-05](../roadmap/tasks/S06-05.md) | Залежить від S05-05/S06-03: з’єднання proposal з підтвердженим draft, без auto-send. |
| [S07-01](../roadmap/tasks/S07-01.md) | Повний progress/partial UI залежить від preview, durable runner та draft workflow. |
| [S07-03](../roadmap/tasks/S07-03.md) | Клавіатура/помилки/відновлення фінального UI після S07-01. |
| [S08-01](../roadmap/tasks/S08-01.md) | Після runner та UI: реальний Chrome smoke/restart. Node VM тести цього не замінюють. |
| [S08-02](../roadmap/tasks/S08-02.md) | Після S08-01: чистий release artifact і погоджений склад випуску. |
| [S08-03](../roadmap/tasks/S08-03.md) | Після залежностей: дозволений cross-service pilot із визначеними акаунтами, даними та ефектами. |
| [S08-04](../roadmap/tasks/S08-04.md) | Після реального пілоту: рішення про випуск, канал, stop/rollback. |
| [S09-09](../roadmap/tasks/S09-09.md) | CAD preview/apply залежить від S03-05 і depot policy; додатковий confirm_live не вводити. |
| [S09-10](../roadmap/tasks/S09-10.md) | Укріплення чинного parcel залежить від S09-09, календаря й статусів. Існуючу команду не вимикати. |
| [S09-11](../roadmap/tasks/S09-11.md) | Укріплення чинного barcodes залежить від S09-09, Drive policy та durable journal. Існуючу команду не вимикати. |
| [S09-12](../roadmap/tasks/S09-12.md) | Реальний Discord/Firebase/depot pilot потребує S09-09, визначеного scope/test account/data і доступу. |

## Що обговорити наступного разу

1. Depot: статуси, календар і logCall — відкриває preview/apply та Discord reschedule strengthening.
2. Drive: дата/іменування/collisions, потім вибір durable runner.
3. Gmail: адресати/Reply-To/мова/labels; AI: provider, payload і бюджет.
4. Коли буде робочий ПК: окремо узгодити оновлення/реєстрацію команд, extension/rules та обмежений pilot.
5. IDE discovery evidence можна закрити окремо від продуктового пілоту.

## Перевірки та межі

Фінальна продуктова перевірка: `node tools/checks.mjs` — PASS 7 gates, включно з **215/215** наявних і доданих мінімальних regression tests.
Firestore Emulator — окремо **2/2** (`npm run test:rules` з локальним pinned JAR); це перевірка правил, не deployed Firebase.
S09-14: існуючі очікування спочатку RED 1/4, fallback RED 3/4; focused GREEN 24/24. Нових test groups для report не додано.
Реальний Chrome, робочий depot, Discord/mobile, Gmail/Drive/AI integrations цим проходом не тестувалися.
Сервіси не запускалися/не перезапускалися, команди не реєструвалися, rules не deploy, main не merge.
Нові MIME/case/AI модулі — перевірені будівельні блоки; повний автоматичний email workflow ще не підключений.
AI schema не доводить правдивість довільного prose; будь-який proposal потребує людини.
Карти report — огляд двох точок, не дорожній маршрут; навігаційні посилання будують маршрут на пристрої.
Manual Eircode не переписує depot street address: оператор звіряє їх перед пересиланням.
Todo cap — простий ліміт, не транзакційна quota. Fatal listener/auth помилка може вимагати reload/rebinding; claimed дію автоматично не повторюємо.
Встановлення залежностей попереджало про Node>=24 для вже наявного @zxing/library; поточний Node20.14 пройшов локальні gates. Runtime upgrade не входив у цей прохід.

## Передача іншому агенту

Почати з AGENTS, AGENT_ASSIGNMENTS і CURRENT. Немає активного writer або незавершеної дорученої задачі.
Не повторювати закриті картки. Для відкладеної роботи спочатку отримати відсутнє рішення/доступ; потім claim одного task у CURRENT/state, test-first мінімум, journal, scoped commit/push.
Продовжувати з `codex`; зберегти несумісні з scope приватні/користувацькі файли.
