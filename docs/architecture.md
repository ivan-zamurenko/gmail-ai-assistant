# Архитектура DPD Assistance — расширение, Discord и Firestore

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**Исторический источник комплекта v1.2:** `gmail-ai-assistant-main.zip`. Снимок и доказательства: [GITHUB_BASELINE](audit/GITHUB_BASELINE.md). [BASELINE](audit/BASELINE.md) относится к первому ZIP и сохраняется только как история.

Содержание: текущие контексты; модули; Discord flow; Drive; Gmail/AI; совместимость; пределы гарантий.

## 1. Текущие контексты выполнения

| Контекст | Фактическая роль | Чего из неё не следует |
|---|---|---|
| `src/popup/` | UI, Gmail count, CAD/lookup и Drive scanner через depotFlow | Закрытие popup не стало автоматически безопасным для Drive batch |
| `src/offscreen/offscreen.js` | Firebase anonymous Auth, onSnapshot по executorUid, transaction claim/result, serial queue | DOM/canvas для Discord Drive decode; произвольный restart batch не гарантирован |
| `src/background/background.js` | Создаёт offscreen, alarm/heartbeat, warming depot tabs, принимает execute message | Нет доказанного восстановления любого claimed задания после restart |
| MAIN depot page | Сериализованные depotMain/depotLookup в сессии пользователя | Imports/outer closure функции не переносятся; страницы не источник доверенных инструкций |
| `bot/` | Самостоятельный Node.js процесс: discord.js, firebase-admin, commands, queue, render, todo, geo | Не часть browser bundle, не AI-провайдер и не замена depot login |
| Firestore | `tasks` для обмена, `todos` для бота; ограничения browser через `firestore.rules` | Не разрешение browser создавать/удалять tasks и не доказательство фактического deployment |
| Node tooling | esbuild, ESLint, node:test; два package/lockfile | Наличие команд не подтверждает успешную установку или build |

В исходном worker уже есть onStartup/onMessage/onAlarm. Описание v1.1 «только onInstalled» к этому снимку не применяется. В исходном `src/config/config.js` действует импорт local.js; сохранённые старые settingsFlow функции не доказывают активное storage-based управление конфигурацией.

## 2. Владельцы модулей

| Путь | Ответственность | Граница |
|---|---|---|
| `bot/src/commands.js`, `register-commands.js` | Схема slash menu и её внешняя регистрация | Register не выполнять в CI без допуска |
| `bot/src/index.js` | Admission guild/permissions, handlers, reply | Не доверять options как одобрению любых эффектов |
| `bot/src/queue.js` | Создание задания, ожидание terminal result, timeout | Результат выполнения не равен доставке Discord reply |
| `bot/src/render.js`, `geo.js` | Lookup cards/history, optional Maps | Ошибка optional enrichment не должна терять facts — целевая гарантия S09-07 |
| `bot/src/todo.js` | Checklist по Discord userId | Не approval email и не depot queue |
| `src/queue/executor.js` | Подключённые depot verbs и минимизация результата | find/all/parcel/retry; barcodes выполняет отдельный offscreen barcodeExecutor |
| `src/offscreen/` | Listener/claim/result и Drive DOM execution | Только назначенная identity, без нового публичного task API |
| `src/depot/` | Lookup, CAD, label decode/naming/filing | Не выдумывать business policy из эвристик |
| `src/gmail/` | Текущие label helpers; будущие messages/drafts по S05 | Не считать helper moveLabels рабочим при gmail.readonly |
| `src/config/`, `bot/config/` | Раздельная локальная config | Bot service credentials никогда не в src/dist |

Не вводить второй бот, ещё одну очередь, FastAPI/Supabase/SQL или новый UI framework по образцу другого проекта. Поддержка текущего `bot/` не является запрещённым новым backend. Существенная смена существующей топологии — отдельное решение.

## 3. Discord → Firestore → depot

Подробный wire contract — [queue-contract](queue-contract.md), команды — [discord-bot](discord-bot.md). Workflow: handler проверяет actor/options → bot создаёт pending schema 2 с executorUid → offscreen claim → barcodeExecutor для barcodes или worker execute для других modes → MAIN lookup/reschedule → terminal result → bot reply. `/todo` обходит extension и использует свою коллекцию.

Явный `dry_run:false` — подтверждение live по решению владельца; отдельного `confirm_live` нет. Preview ID в текущем протоколе отсутствует. Дальнейшее укрепление apply по S03-05/S09-09 должно проверять scope, actor и свежесть данных без дополнительного операторского подтверждения. Любая общая policy используется и popup, и ботом; нельзя ослабить её в одном входе.

## 4. Drive — существующее и целевое

Scanner доступен из popup и через Discord: offscreen выполняет barcodeExecutor с DOM/canvas, а depot lookup/reschedule делегирует background bridge. S04-03 проверяет устойчивость существующего runner, не создаёт второй. Локальная recovery-очередь хранит точные цели текущего дня; retry не перечитывает Drive и удаляет устаревшую партию предыдущего дня. Это не полное восстановление любого прерванного Drive batch.

Цель S01/S04: input validation → bounded list/download → barcode candidates → проверенные facts → немутирующий filing plan → одобрение → apply → сверка неопределённых writes. Создание folders относится к apply, а не к preview. Текущий monthFolders имеет guard dryRun и отдельные regression tests; исторический дефект создания папок не является текущим установленным дефектом.

## 5. Gmail и AI — OWNER-D01

Полная Gmail queue → нормализация message/thread → candidates → проверенные depot facts → policy → AI proposal → schema/content checks → ручная проверка/правки → одобрение конкретной версии → подтверждённый Gmail draft → отправка человеком в Gmail.

В исходниках нет активного AI transport и полного Gmail read/review/draft pipeline. S05/S06 остаются будущими задачами. Discord review для писем и auto-send не включены автоматически: оба требуют отдельного решения. Не связывать `/todo done` или depot `dry_run:false` с почтовым одобрением.

## 6. Совместимость

Сохранять extension identity, root/bot lockfiles, Firestore schema и mirror values. Сначала определить переходные правила старого бота/нового расширения и наоборот, затем менять документ/producer/consumer/rules. Не очищать коллекции, profile storage или user files ради миграции.

Browser config содержит статический import local.js. Внимательно проверить, какие значения попадают в dist; gitignore сам по себе не защищает собранный artifact. Deployment rules, регистрация команд и старт бота — разные действия с разными допусками.

## 7. Что нельзя считать готовой гарантией

Claim не означает exactly-once внешней операции; ephemeral не означает отсутствие передачи данных Discord; heartbeat не заменяет restart tests; maps marker не доказывает правильность доставки; наличие команды не означает подключённый executor. Существующие product tests в `test/` (реестр — `docs/TESTING.md`) и отдельные offline probes — полезный baseline, не полный integration certificate.

Критерии по этим границам находятся в [S09](../roadmap/ROADMAP.md) и [security](security-and-privacy.md).
