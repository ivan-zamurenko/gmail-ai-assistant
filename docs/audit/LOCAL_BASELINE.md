# Актуальний стан після встановлення комплекту — 2026-10-23

## Обсяг і пріоритет

Власник доручив налаштувати чинний проєкт за комплектом і уточнив: нові функції
виконуються окремо. Ця зміна встановлює workflow, інструкції та локальні
валідатори; вона не виконує 53 задачі roadmap і не є продуктовим релізом.

Порядок джерел: явні поточні рішення власника → чинний AGENTS/TEAM/SECURITY →
поточний код і свіжі результати перевірок → план комплекту → архівні аудити.
Архівні OWNER-D01/D02 збережені зі своїм походженням, а не як нова згода на
зовнішні дії. Мова співпраці — українська. Російські назви файлів комплекту
збережено для стабільних посилань.

## Походження та збереження роботи

- Джерело: `DPD_Assistance_MD_Execution_Kit_v1_2.zip`.
- До копіювання перевірено всі 193 записи `SHA256SUMS`: розбіжностей немає.
  Архівні суми збережено для оригіналу; адаптовані файли мають інший вміст.
  У двох старих RED-логах прибрано кінцеві пробіли для Git whitespace gate;
  результати й текст повідомлень залишені історичними.
- Робоча гілка: `codex`; початковий HEAD:
  `f1bead1cddfc07a8b68e0d15833cfcdd1dfc0e05`.
- Існуючих CURRENT/state не було. Початковий kit checkpoint KIT-02 замінено
  поточним; історія виготовлення комплекту залишається в KIT evidence/checks.
- README та AGENTS об'єднані, а не замінені. Оригінали є в Git;
  README комплекту збережено в `checks/history/kit-v1.2-README.md`.
- До початку роботи вже були змінені root/bot package manifests і locks,
  `manifest.json`, `bot/src/geo.js`, `bot/src/render.js`, `src/config/config.js`,
  `src/config/local.example.js`, `src/depot/lookup.js`, `src/queue/executor.js`,
  `test/bot/geo.test.js`, `test/bot/render.test.js`, `docs/SECURITY-WORKLOG.md`.
  Вони не входять у commit встановлення; їхній вміст перевіряється за локальними
  контрольними сумами до і після інтеграції.
- Приватні конфіги, credentials і фото не копіювалися. Поточні security rules,
  runtime, dependencies, extension identity та версії продукту не змінювалися.

## Розбіжності з архівом

| Архівне припущення | Поточний стан / джерело |
|---|---|
| parcel/barcodes не мають executor | Реалізовані parcel, barcodes і retry: `src/queue/executor.js`, `src/queue/barcodeExecutor.js`, `src/offscreen/offscreen.js`, відповідні `test/queue/` |
| Для live потрібне confirm_live | Рішення 2026-09-02: лише явне `dry_run:false`; `bot/src/commands.js`, `test/bot/commands.test.js` |
| Drive scan залежить лише від popup | Discord scan має offscreen DOM та вузький background bridge; це не доказ відновлення після закриття браузера |
| Labels шукає Pending List | Використовуються точні targets після depot lookup; `test/depot/depotScript.test.js` |
| Dry-run створює папки | Є guard у `src/depot/monthFolders.js` і регресії folder/batch zero-write у `test/depot/` |
| Чотири тести у test/security.test.js | Suite розділено за модулями в `test/`; чинна карта — [TESTING](../TESTING.md) |
| Нові тести слід класти в tests/ | Зберігаємо `test/`; tooling перевірки — `tools/tests/` |
| Git дозволи невідомі | Чинний AGENTS дозволяє scoped commit/push у codex; merge main потребує окремого дозволу |
| Відповідати російською | Власник явно визначив українську; продуктове UI не перекладається цією зміною |
| Усі задачі todo описують стан продукту | Це початкові статуси acceptance-плану. Наявна функція не закриває автоматично ширші критерії картки |

S09-10/S09-11 тепер описують перевірку й укріплення існуючих режимів. Інші
майбутні вимоги (наприклад Gmail pipeline, preview revisions, ширше recovery)
залишаються планом, не твердженням про реалізацію. Перед виконанням кожної картки
звірити її baseline з кодом. Жодна картка не повертає друге live-підтвердження.

## Перевірки і межі доказів

Точні результати встановлення: [.workflow/evidence/S00-01.json](../../.workflow/evidence/S00-01.json).
Локальні validators перевіряють посилання, граф залежностей, state/evidence,
обмеження шляхів та offline reader. `npm test` окремо охоплює product і tooling.
Історичні логи `checks/` не використовуються як поточний PASS.

Старий `checks/github/offline-discord.probe.mjs` перейменовано, щоб `node --test`
не запускав snapshot-очікування автоматично. Старий Drive VM probe несумісний
із поточним module graph; його помилка не доводить регресію нинішнього dry-run.

Не перевірялися: свіжий install dependencies, watch/rebuild контракт, IDE discovery
у новій сесії, реальний Chrome/depot/Discord/Firebase/Google/AI. Приклади IDE
конфігурації не активовані. Наявні залежності використано без оновлення.
Live запуск, command registration, deployment і передавання листів не виконувалися.

## Подальша робота

Стан і найближча рекомендована картка — [.workflow/CURRENT.md](../../.workflow/CURRENT.md).
Наступна картка виконується лише як окреме доручення. Pending gates з архіву
стосуються невирішених майбутніх змін; вони не скасовують прийняті рішення про
існуючі команди й не надають нових production-дозволів.
