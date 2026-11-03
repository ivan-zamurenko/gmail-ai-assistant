# Обновление v1.2 — Discord/Firestore включены в полный комплект

> Історичний звіт комплекту, не поточна перевірка. Актуальний стан: [LOCAL_BASELINE](LOCAL_BASELINE.md).

**Дата: 9 октября 2026 года.** Это отчёт о фактически подготовленной документации и её проверках. Он не заменяет испытания работающего приложения.

## 1. Что изменено

Комплект v1.1 адаптирован к последнему предоставленному `gmail-ai-assistant-main.zip`. Основа теперь явно включает Chrome MV3 extension, Node.js Discord bot, Firestore tasks/todos, offscreen listener и runtime executor. Исходники приложения не менялись.

Добавлены подробные [описание бота](../discord-bot.md), [контракт очереди](../queue-contract.md), [runbook](../discord/RUNBOOK_RU.md), [матрица тестов](../discord/TEST_MATRIX.md), [capability inventory](../discord/capabilities.json) и [baseline нового архива](GITHUB_BASELINE.md). Переработаны архитектура/toolchain/структура, AGENTS/Copilot/Codex, связанные контракты, prompts и инструкции тестирования. Тексты различают подключённый код, неподключённые режимы, предлагаемые гарантии и непроверенную эксплуатацию.

Всего **115 Markdown-файлов**, **53 карточки**, **10 стадий**, **265 сценариев приёмки**. Прежние **41 task ID сохранены**; 12 новых S09 карточек описывают проверку и укрепление существующего бота, а не создание второго. Порядок определяется зависимостями: S09 идёт параллельно, S08-03 учитывает S09-12. Опциональные S09-10/S09-11 не блокируют пилот find/all/todo.

OWNER-D01 сохранён: AI proposal → обязательная ручная проверка/правки → подтверждённый Gmail draft → ручная отправка в Gmail. Discord email review и auto-send не добавлены. OWNER-D02 фиксирует включение имеющегося бота в документацию, не разрешает live-действия. Все 53 product entries — todo, все 12 gates — pending.

## 2. Источники и история

[Инвентаризация](github-source-inventory.json) фиксирует SHA-256 ZIP и 71 файл, исключая фотографию накладной. [Source traceability](source-traceability.json) связывает утверждения с путями, функциями и строками. [Source integrity](../../checks/kit-v1.2/source-integrity.json) подтверждает неизменность этих файлов и ZIP. Имя main в архиве не подтверждает Git HEAD; новый ZIP не содержит .git, live GitHub не проверялся.

KIT-00/KIT-01, старые логи и аудит первого ZIP сохранены как история и помечены явно. Предыдущий CURRENT выпуска сохранён в `checks/history/CURRENT-v1.1.txt`; это не резервная копия неизвестного пользовательского рабочего дерева. [Карта изменения файлов](../../checks/kit-v1.2/change-manifest.json) описывает добавленные и изменённые пути относительно v1.1.

## 3. RED и GREEN документационного контракта

Десять новых assertions сначала выполнены на v1.1 до правок: **10 failed, exit 1** по отсутствующим bot documents/metadata. [RED log](../../checks/kit-v1.2/discord-docs-red.log). После добавления документации отдельный прогон дал **10 passed, exit 0**: [GREEN log](../../checks/kit-v1.2/discord-docs-green.log).

Первый общий прогон дал 36/37: один assertion ожидал точное `auto-send`, а документ использовал `Auto-send`. Исправлен регистр термина в документе, без изменения требования или ослабления теста. [Исходный общий лог](../../checks/kit-v1.2/tool-tests-initial.log) сохранён. Это несогласованность документационного теста и написания термина, не функциональный дефект runtime.

## 4. Успешные проверки комплекта

| Проверка | Фактический результат | Лог |
|---|---|---|
| `node tools/roadmap.mjs validate` | PASS: 53 cards, 10 stages, 12 gates; exit 0 | [roadmap](../../checks/kit-v1.2/roadmap-validate.log) |
| `node tools/roadmap.mjs next` | S00-01 ready, без изменения state; exit 0 | [selector](../../checks/kit-v1.2/roadmap-next.log) |
| `node tools/check-docs.mjs` | PASS: 115 управляемых Markdown, локальные ссылки и fences; exit 0 | [Markdown](../../checks/kit-v1.2/markdown-validate.log) |
| `node --test tools/tests/*.test.mjs` | 37 passed, 0 failed, 0 skipped; exit 0 | [tests](../../checks/kit-v1.2/tool-tests.log) |
| `node tools/build-start-here.mjs` | Reader перестроен из всех 115 Markdown; exit 0 | [HTML](../../checks/kit-v1.2/html-build.log) |
| JSON/TOML/YAML/frontmatter | Структурный parsing PASS; не проверка актуальной vendor schema | [formats](../../checks/kit-v1.2/formats.json) |
| Штатная упаковка project skill | Validator PASS; полный `skill.zip` | [packaging](../../checks/kit-v1.2/skill-package.log) |

[Машинный отчёт](../../checks/kit-v1.2/run-report.json) и [KIT-02 evidence](../../.workflow/evidence/KIT-02.json) сохраняют команды и результаты. 37 тестов — это 27 прежних tooling tests и 10 новых bot-document assertions, а не 37 новых тестов приложения.

## 5. Отдельные проверки исходного приложения

Среда анализа: Node 22.16.0, npm 10.9.2, Python 3.13.5. Это не новый согласованный pin проекта.

| Проверка | Результат | Граница |
|---|---|---|
| `node --check` исходных JS | 49 файлов, exit 0 | Только синтаксис, не сборка/import resolution |
| Offline contracts/executor | 10 passed, 0 failed, 0 skipped; exit 0 | Fake Chrome, без выполнения MAIN function и без живой сети |
| `node --test test/security.test.js` | exit 1, `ERR_MODULE_NOT_FOUND: discord.js` | env_blocked: четыре исходных теста не исполнились |
| Drive Dry Run probe | exit 1: 2 POST вместо ожидаемых 0 | Дефект воспроизведён на synthetic input; runtime не исправлен |

Логи и команды: [source-checks](../../checks/kit-v1.2/source-checks.json), [syntax](../../checks/kit-v1.2/source-syntax.json), [offline](../../checks/kit-v1.2/source-discord-offline.log), [security blocker](../../checks/kit-v1.2/source-security-suite.log), [Dry Run](../../checks/kit-v1.2/source-dry-run-probe.log). Для offline test явно установить `DPD_SOURCE_ROOT` на отдельную исходную копию; documentation-only ZIP не содержит src/bot.

## 6. Что не выполнялось

Нет clean npm installations, сборки приложения, Chrome load, Firestore Emulator, реальных Discord/Firebase/Maps/Gmail/depot/AI calls, регистрации команд, rules deployment, публикации, commit/push или установки настроек в IDE. Не проводились полная проверка безопасности, измерение бизнес-качества и визуальный аудит HTML reader во всех браузерах. Ранее проверенные ссылки справочников не переобъявлены проверенными заново в этой редакции.

Зелёные проверки документации не скрывают source blocker и неисправленный Dry Run. Claim deadline, reply delivery, восстановление после сбоев и preview binding описаны как предмет задач там, где в текущем коде гарантии не доказаны.

## 7. Применение

Следовать [INSTALL_RU](../../INSTALL_RU.md). Не распаковывать поверх проекта с безусловным overwrite. Сохранить реальные CURRENT/state/evidence, оба lockfiles, исходные security tests, local.js и неизменённый runtime. Перенести новые карточки/gates и reviewed зависимости, не сбрасывая сделанную пользователем работу. Первый предлагаемый шаг при чистом состоянии — S00-01.
