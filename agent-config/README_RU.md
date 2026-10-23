# Конфигурация агентов: что применять и где

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Общие требования живут в [AGENTS.md](../AGENTS.md). Copilot использует свой repo instructions file; Codex — AGENTS и собственные config layers. Не копировать один формат в другой.

[Copilot setup](../COPILOT_SETUP_RU.md) описывает инструкции, discovery и optional JSON merge. [Codex setup](../CODEX_SETUP_RU.md) описывает AGENTS, permissions и TOML example.

`codex.config.example.toml` не применяется автоматически. `docs/copilot/settings.merge-example.json` тоже только образец. Модель, reasoning, оплачиваемый бюджет и credentials отсутствуют намеренно. Проверить поддерживаемые keys в установленной версии до слияния.

Первый тест — read-only объяснение CURRENT/следующего task. Не подключать рабочие Gmail/Drive/depot для теста configuration. Результат обнаружения инструкций записать в S00-05; набор файлов не доказывает настройки пользовательского IDE.

## Дополнение v1.2: бот включён в рабочий контекст

Инструкции теперь относятся к Chrome MV3 + Node.js Discord bot + Firestore. Сначала сверить docs/audit/GITHUB_BASELINE.md, затем читать docs/discord-bot.md и docs/queue-contract.md только для bot/queue задач. Root и bot имеют свои package-lock.json; test/ уже существует.

Для проверки обнаружения правил попросить агента только прочитать контракт и назвать подключённые/неподключённые команды. Не запускать bot, register или rules deployment. Новый адресный файл Copilot — `.github/instructions/discord-queue.instructions.md`; для Codex те же границы заданы root AGENTS. Внешние настройки моделей/permissions в этом обновлении не применялись и не проверялись в IDE.
