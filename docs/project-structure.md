# Структура проекта v1.2 и назначение каждого слоя

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


## Два дерева: документация и исполняемый репозиторий

Данный ZIP содержит документацию, примеры агентских настроек и tooling. Он не включает runtime `src/`, `bot/`, credentials, node_modules, Git history или изображения накладных. В настоящем проекте после reviewed merge должна сохраниться такая структура:

```text
gmail-ai-assistant/
  README.md, 00_READ_FIRST.md, AGENTS.md
  .github/                    # agent instructions и будущий CI
  .agents/skills/dpd-task-delivery/
  .workflow/                  # процесс разработки, не Firestore queue
  agent-config/               # необязательные примеры, не runtime config
  roadmap/tasks/              # S00-S08 + параллельный поток S09
  docs/
    discord-bot.md
    queue-contract.md
    discord/RUNBOOK_RU.md
    discord/TEST_MATRIX.md
    audit/GITHUB_BASELINE.md
  package.json, package-lock.json
  build.js, eslint.config.js, manifest.json
  firebase.json, firestore.rules
  bot/
    package.json, package-lock.json
    config/config.js, config/local.example.js
    src/commands.js, src/register-commands.js
    src/index.js, src/queue.js, src/contract.js, src/firebase.js
    src/render.js, src/geo.js, src/todo.js, src/errors.js
  src/
    background/background.js
    offscreen/offscreen.html, offscreen.js
    queue/contract.js, executor.js
    popup/, depot/, gmail/, auth/, parser/, utils/
    config/config.js, local.example.js
  test/        # существующие поточні регресії test/
  tests/                      # дополнительные наборы создаются по карточкам
  tools/                      # существующий barcodeTest + docs tooling
  checks/                     # offline probes, не live credentials
  assets/, snippets/
```

Проверено по последнему предоставленному ZIP. В нём нет `src/storage/`: ссылки на прежние store.js/settings.js являются историческими, а не действующими imports. Наличие `src/popup/settingsFlow.js` не доказывает, что старый settings UI подключён: смотреть `popup.js` и `config.js`.

## Что сохраняется локальным

`src/config/local.js`, `bot/config/local.js`, service-account JSON, реальные API keys, session data и customer images не переносить через комплект. `dist/`, root `node_modules/` и `bot/node_modules/` — производные локальные файлы. Не копировать секретный bot/config в browser bundle или deploy artifact расширения.

Новый GitHub ZIP содержит `labels_example/label_example.png`; этот файл не включён в обновлённый комплект. Исключение файла из portable bundle не означает удаление из репозитория или очистку Git history.

## Где искать агенту

Slash schema — commands.js; permissions и reply — index.js; Firestore producer — bot queue; consumer — offscreen; depot dispatch — executor; storage enforcement — rules; карточки результата — render; optional Maps — geo; personal checklist — todo. Source/reference таблица: [baseline](audit/GITHUB_BASELINE.md).

При изменении queue schema читать оба contract.js и rules. При изменении dependency — соответствующий package и lockfile. При изменении MAIN-функции проверять serialization и собранное расширение, а не только Node import.

## Изменение структуры

Не переименовывать старые 41 task IDs ради вставки нового этапа. S09 — параллельный поток существующего бота; порядок определяется depends_on, а не номером папки. Не создавать два независимых CI, дублирующих один и тот же full suite без причины. Один integrator владеет общими contract mirrors, rules, locks и state.
