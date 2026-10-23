# Указатель документации DPD Assistance

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


## Начало и факты

[Первое чтение](../00_READ_FIRST.md), [установка комплекта](../INSTALL_RU.md), [текущий baseline GitHub ZIP](audit/GITHUB_BASELINE.md), [исторический аудит](audit/BASELINE.md), [соответствие образцу](audit/REFERENCE_MAPPING.md), [проверки v1.2](audit/UPDATE_V1_2.md), [источники](SOURCES.md).

## Архитектура и бизнес-границы

[Архитектура](architecture.md), [структура](project-structure.md), [общие контракты](contracts.md), [depot](depot-contract.md), [Drive](drive-contract.md), [Gmail](gmail-contract.md), [AI](ai-boundary.md), [security/privacy](security-and-privacy.md).

[Решения](decisions.md), [gates](owner-gates.md), [вопросы владельцу](../QUESTIONS_RU.md). Эти файлы явно отличают предложенные defaults от подтверждённых бизнес-правил.

## Работа с агентами

[AGENTS](../AGENTS.md), [Copilot setup](../COPILOT_SETUP_RU.md), [подробное руководство Copilot](copilot/WORKFLOW_RU.md), [Codex setup](../CODEX_SETUP_RU.md), [особенности Codex workflow](codex/WORKFLOW_RU.md), [skills policy](skills-policy.md), [сообщения агенту](../prompts/README.md).

## Разработка и передача

[Toolchain](toolchain.md), [TDD и Git](testing-and-commits.md), [порядок работы владельца](owner-workflow.md), [handoff](handoff.md), [checkpoint template](../CURRENT.template.md), [реальный CURRENT](../.workflow/CURRENT.md), [локальные инструменты](../tools/README.md).

## Этапы

[Roadmap](../roadmap/ROADMAP.md), [вехи](../roadmap/MILESTONES.md), [совместимость и миграции](../roadmap/MIGRATIONS.md). Все подробные карточки (54) доступны из roadmap и `START_HERE.html`.

[Решение владельца по AI/email](../OWNER_DECISION_GMAIL_RU.md) · [Связка AI → review → draft](../roadmap/tasks/S06-05.md).

## Discord и Firestore

[Существующие команды и вывод](discord-bot.md), [queue schema/rules/recovery](queue-contract.md), [runbook](discord/RUNBOOK_RU.md), [матрица тестов](discord/TEST_MATRIX.md), [решение включить бота](../OWNER_DECISION_DISCORD_RU.md). JSON [capabilities](discord/capabilities.json) фиксирует обнаруженное в исходном снимке, не live статус. Все 12 подробных S09 карточек доступны из roadmap.
