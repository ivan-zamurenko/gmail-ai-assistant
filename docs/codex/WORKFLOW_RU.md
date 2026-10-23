# Codex: ежедневный цикл DPD

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Общий подробный процесс карточек, TDD, диагностики, review и передачи состояния находится в [общем справочнике](../copilot/WORKFLOW_RU.md). Здесь только различия Codex; не нужно копировать справочник в постоянные инструкции.

## Начало

Запустить Codex из существующего repo root, проверить применимые AGENTS/overrides и permissions. Прочитать CURRENT и `docs/decisions.md`. Выбрать одну карточку через `node tools/roadmap.mjs next`. В исходном комплекте следующая — S00-01.

При обнаруженном skill можно вызвать `$dpd-task-delivery`. Он направляет workflow, но не подменяет tests, tools и разрешения. Если skill не виден, работать по карточке и явно отметить fallback.

## Права

Обычный writer использует ограниченный workspace-write с approval на действия вне разрешённой области. Для review — отдельный read-only режим. Предлагаемый TOML не активируется автоматически и не переопределяет managed policy.

Не открывать full access ради установки dependencies или Git commit. Установка через registry, изменение protected Git paths и внешнее тестирование — разные запросы разрешения. Не переносить token в shell command, config tracked file или MAIN page context.

## Выполнение

Получить настоящий RED на локальной fixture, минимально исправить, проверить GREEN/regressions. Для DPD особенно важно тестировать serialized injection и весь граф Drive effects. Изолированный callback fake не показывает реальные Google scopes; это остаётся отдельным gate.

Не создавать subagents автоматически. Отдельный reviewer полезен для uncertain writes, auth/origin, storage migration и Gmail recipients. Его границы должны включать task, diff/base и ожидаемый результат, а tools — не позволять правки, если нужен read-only review.

## Завершение

Сохранить CURRENT/state/evidence и проверить diff. Commit/push только в разрешённой области. При блокере оставить одну воспроизводимую следующую команду. Для новой сессии достаточно checkpoint и карточки, не полного chat transcript.

Настройка, источники и проверка discovery: [CODEX_SETUP_RU.md](../../CODEX_SETUP_RU.md).

## Дополнение v1.2: бот включён в рабочий контекст

Инструкции теперь относятся к Chrome MV3 + Node.js Discord bot + Firestore. Сначала сверить docs/audit/GITHUB_BASELINE.md, затем читать docs/discord-bot.md и docs/queue-contract.md только для bot/queue задач. Root и bot имеют свои package-lock.json; test/ уже существует.

Для проверки обнаружения правил попросить агента только прочитать контракт и назвать подключённые/неподключённые команды. Не запускать bot, register или rules deployment. Новый адресный файл Copilot — `.github/instructions/discord-queue.instructions.md`; для Codex те же границы заданы root AGENTS. Внешние настройки моделей/permissions в этом обновлении не применялись и не проверялись в IDE.
