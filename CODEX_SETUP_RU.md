# OpenAI Codex — подключение к DPD Assistance

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Дата сверки официальной документации: 9 октября 2026 года. Это инструкции и конфигурационный пример, не утверждение о подключении к твоему аккаунту или установленному IDE.

## 1. Основной контекст

Положить `AGENTS.md` в корень существующего репозитория. Codex формирует цепочку инструкций от корня к рабочему каталогу; override-файлы и глобальные инструкции могут менять результат. Проверить, нет ли конфликтующего `AGENTS.override.md` или глобального правила, которое заставляет создавать новый проект/другой стек. [S-CODEX-AGENTS](docs/SOURCES.md)

Запускать из нужного Git root. В этом комплекте не используются многочисленные вложенные AGENTS: соответствующий контракт читает сама карточка. Это уменьшает дублирование и помогает не смешивать depot MAIN с обычным module context.

## 2. Безопасный конфигурационный пример

Файл [agent-config/codex.config.example.toml](agent-config/codex.config.example.toml) намеренно не называется активным `.codex/config.toml`. Сначала сравнить со своей конфигурацией и политикой организации.

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false
```

Эти настройки относятся к sandbox/approval для локальных команд. Project-scoped config применяется только для доверенного проекта и подчиняется другим слоям конфигурации/managed policy. Они не являются единым запретом сети для всех браузерных и connector tools. [S-CODEX-CONFIG; S-CODEX-SECURITY](docs/SOURCES.md)

Не ставить `danger-full-access`, `--yolo` или автоматическое одобрение ради ускорения. Не копировать deprecated/unsupported approval values из старых примеров. Модель и reasoning здесь намеренно не закреплены: их доступность/стоимость зависят от твоего интерфейса и аккаунта.

## 3. IDE и CLI — не одни и те же настройки

Codex CLI и IDE используют Codex configuration для поведения агента; настройки редактора находятся в отдельном слое `chatgpt.*`. `.github/copilot-instructions.md` не превращается автоматически в активный Codex TOML. [S-CODEX-IDE](docs/SOURCES.md)

В IDE открыть настройки Codex и проверить активный слой конфигурации/permissions. В CLI перед использованием примера сверить `codex --version` и `codex --help`; команды не выполнялись в этой audit-сессии. Не считать отсутствие установленного CLI ошибкой продукта.

## 4. Read-only проверка

При доступном CLI и поддержке соответствующих опций:

```sh
codex --sandbox read-only --ask-for-approval on-request
```

В сессии попросить только перечислить применимые инструкции, CURRENT, следующую карточку и доступные локальные проверки. Этот запуск не должен читать личную почту, обращаться к Drive/depot, менять файлы или начинать миграцию.

Ожидаемый контекст: DPD Assistance, Chrome MV3 + Node Discord bot + Firestore, esbuild, offscreen/executor, поточна задача з CURRENT/next, два lockfile та модульний test/ suite. Folder dry-run має поточні регресії. Проверить фактическое обнаружение файлов в интерфейсе/диагностике, а не доверять только ответу модели. При конфликте сначала устранить конфликт инструкций.

## 5. Project skill

В `.agents/skills/dpd-task-delivery/` находится instruction-only workflow. В Codex локальные skills обнаруживаются в `.agents/skills` по пути от рабочей директории до repo root. Вызывать явно как `$dpd-task-delivery` только при реальном обнаружении. [S-CODEX-SKILLS](docs/SOURCES.md)

Skill требует существующие AGENTS/CURRENT/roadmap и локальные инструменты проекта; он не является самостоятельным приложением. В нём нет доступа к Gmail/Drive и установки новых сервисов. Если discovery не работает, выполнить карточку по AGENTS напрямую и не заявлять о запуске skill.

## 6. Работа и reviewer

Writer выполняет одну карточку, локальные tests и reviewed diff. Reviewer получает baseline/task/diff и отдельную read-only сессию. Не запускать двух writer в одном checkout. Несколько сессий без отдельных worktrees не изолируют файлы.

Network access для установки dev-зависимостей разрешать только в необходимом scope и отдельно от runtime data. Доступ к registry не означает разрешение подключиться к рабочему Google-аккаунту. Если protected path или Git operation требует approval, не обходить это изменение глобальных прав.

## 7. Приёмка настройки

Проверить: правильный root; AGENTS обнаружен; conflict/override понятен; skill виден либо fallback честно указан; permissions соответствуют роли; `node tools/roadmap.mjs next` возвращает ожидаемый task; никакие tools не обращались к production; настройки не содержат secrets.

Записать version/harness/date и фактическую проверку в S00-05. До этого статус настройки на твоём компьютере — «файлы подготовлены, обнаружение не проверено». Справочник: [docs/codex/WORKFLOW_RU.md](docs/codex/WORKFLOW_RU.md).

## Дополнение v1.2: бот включён в рабочий контекст

Инструкции теперь относятся к Chrome MV3 + Node.js Discord bot + Firestore. Сначала сверить docs/audit/GITHUB_BASELINE.md, затем читать docs/discord-bot.md и docs/queue-contract.md только для bot/queue задач. Root и bot имеют свои package-lock.json; test/ уже существует.

Для проверки обнаружения правил попросить агента только прочитать контракт и назвать подключённые/неподключённые команды. Не запускать bot, register или rules deployment. Новый адресный файл Copilot — `.github/instructions/discord-queue.instructions.md`; для Codex те же границы заданы root AGENTS. Внешние настройки моделей/permissions в этом обновлении не применялись и не проверялись в IDE.
