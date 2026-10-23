# Фактическая проверка комплекта и границы результата

> Історичний звіт комплекту, не поточна перевірка. Актуальний стан: [LOCAL_BASELINE](LOCAL_BASELINE.md).

> Исторический документ первого ZIP / предыдущей версии комплекта. Не описывает автоматически новый bot/queue runtime. Актуальный снимок: [GITHUB_BASELINE](GITHUB_BASELINE.md); проверки обновления: [UPDATE_V1_2](UPDATE_V1_2.md).
Дата: 9 октября 2026 года. Исторический отчёт KIT-00 / v1; исходные результаты и количество задач относятся к тому выпуску. Обновление OWNER-D01 / v1.1 описано отдельно в [UPDATE_V1_1.md](UPDATE_V1_1.md). Этот отчёт относится к файлам `dpd-assistance-kit` и отдельной offline проверке исходного архива. Он не означает установки на компьютере владельца, запуска расширения в рабочем Chrome или выполнения product roadmap.

## 1. Среда и происхождение

При выполнении проверок использовались Node 22.16.0, npm 10.9.2 и Python 3.13.5. JavaScript runtime-команды запускались в извлечённой исходной копии; tooling-команды — в корне нового комплекта. Версии описывают эту проверку, а не навязывают пользователю новый toolchain: воспроизводимая clean установка остаётся S00-02.

Исходный ZIP проверен SHA-256. 42 извлечённых source/text файла сверены с инвентаризацией; изменений нет. `node_modules` использовался только как архивная зависимость ESLint, не как доказательство новой установки. Подтверждение: [source-integrity.json](../../checks/kit/source-integrity.json), [source-inventory.json](source-inventory.json).

## 2. Исходный runtime

| Проверка | Результат | Exit code | Что подтверждено |
|---|---|---|---|
| Syntax check всех `src/**/*.js` | PASS, 25 файлов | 0 | Синтаксис файлов допустим для проверенного Node parser |
| ESLint исходных JavaScript | PASS | 0 | Настроенные lint rules не нашли нарушений |
| Drive dryRun offline probe | FAIL, 2 POST вместо 0 mutations | 1 | На synthetic inputs настоящий scanner создаёт отсутствующие папки даже при dryRun=true |

Probe подставляет fetch, image reader и decoder boundary, но исполняет исходный scanner и naming modules. Он не вызывает Google, Gmail или depot. Его FAIL сохранён намеренно: менять ожидание ради зелёного архива запрещено. Код приложения этим комплектом не исправлялся; исправление — [S01-01](../../roadmap/tasks/S01-01.md).

Логи: [syntax](../../checks/baseline/syntax.log), [ESLint](../../checks/baseline/eslint.log), [dryRun](../../checks/baseline/drive-dry-run.log). Пустой ESLint log означает отсутствие диагностик при exit 0, а не отсутствие запуска.

Для повторения на отдельной исходной копии:

```sh
node checks/baseline/syntax-check.mjs --root /path/to/source-repository
node --experimental-vm-modules checks/baseline/drive-dry-run-probe.mjs --root /path/to/source-repository
```

Это команды из корня комплекта. `--root` должен указывать на исходники проекта, не на ZIP документации без `src`. Для ESLint используется установленный/проверенный toolchain источника; clean install в этой сессии не выполнялась.

## 3. Проверки самого комплекта

| Команда из корня комплекта | Проверяемая область |
|---|---|
| `node tools/roadmap.mjs validate` | 40 cards, 9 stages, 10 gates, зависимости, state, пути и evidence rules |
| `node tools/roadmap.mjs next` | Первая ready task S00-01 без изменения файлов |
| `node tools/check-docs.mjs` | UTF-8, непустые управляемые Markdown, закрытые fences и существующие локальные ссылки |
| `node --test tools/tests/*.test.mjs` | 27 тестов валидаторов, selector и HTML builder; нет failed/skipped |
| `node tools/build-start-here.mjs` | Построение offline reader из Markdown, без remote scripts |

Первый прогон Markdown validation выявил три ссылки на ещё не созданный этот отчёт. Отчёт добавлен до финальной упаковки; повторный прогон сохранён в [run-report.json](../../checks/kit/run-report.json). Это tooling failure по реальному отсутствующему файлу, не фиктивный product RED.

Тесты покрывают cycles, неизвестные IDs/gates, missing cards, path traversal/symlink escape, отсутствие evidence у done, state inconsistency, pending gate, сохранение активной задачи, отказ invalid UTF-8 и missing links. Отдельно проверено, что текст shell command внутри task card не исполняется selector. HTML builder экранирует недоверенный Markdown; это не полноценный browser accessibility audit.

JSON, TOML и YAML/frontmatter проверяются отдельной структурной проверкой при упаковке. Skill `dpd-task-delivery` прошёл штатный validator и упакован отдельно; использование этого skill реальным IDE-агентом не проверялось.

## 4. Что не выполнялось

Не выполнялись clean `npm ci`, сборка исходного приложения, его загрузка в Chrome, реальный OAuth, Gmail read/draft/send, Drive read/write, depot lookup/reschedule, AI requests, store publication, Git commit/push и установка настроек в пользовательском IDE.

Не проверялись фактические permissions пользователя, account/model availability, бизнес-правила изменения даты, календарь организации, ретенция клиентских данных и качество декодирования приватного photo corpus. Нет оснований ставить related gates approved.

27 тестов комплекта — не 27 product tests и не доказательство готовности extension. 25 syntax checks — не end-to-end сценарии. HTML содержит полный текст Markdown, но визуальное отображение во всех браузерах не проверено.

## 5. Состояние передачи

Все 40 product cards остаются `todo`; 10 gates — `pending`. Audit KIT-00 хранится отдельно: [.workflow/evidence/KIT-00.json](../../.workflow/evidence/KIT-00.json). Нет выдуманных commit SHA и claims об успешном подключении внешних сервисов.

Основной архив содержит документацию, configs/examples и tooling. В нём нет исходного runtime, Git history, node_modules и customer images. При установке требуется сравнение/объединение файлов по [INSTALL_RU.md](../../INSTALL_RU.md). Источники и структура образца: [SOURCES](../SOURCES.md), [REFERENCE_MAPPING](REFERENCE_MAPPING.md).
