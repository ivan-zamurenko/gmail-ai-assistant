# Выполнить одну карточку

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


```text
Выполни только <TASK_ID> по roadmap/tasks/ в существующем DPD Assistance.
Прочитай применимые AGENTS, CURRENT и docs/decisions.md.
Сверь состояние с фактическим checkout, веткой и узким diff.
Проверь зависимости и gates через node tools/roadmap.mjs validate.
Открой карточку и только связанные контракты, callers, исходники и tests.

Сначала проверяемый критерий и исполняемый тест, затем ожидаемый RED,
минимальное изменение, GREEN и затронутые регрессии.
Для документации используй валидатор без выдуманного behavioral RED.
Не ослабляй expectations, не делай skips ради зелёного результата.
После двух безрезультатных исправлений проверь одну диагностическую гипотезу.

Работай локально на synthetic fixtures. Нет live Gmail/Drive/depot/AI,
send, reschedule или customer-file moves без отдельного разрешения.
Сохрани manifest identity и пользовательские настройки.
Для injected code проверь serialization и отсутствие outer dependencies.

Проверь diff; commit только если входит в поручение, push отдельно.
Обнови существующие CURRENT/state/evidence с реальными командами,
exit codes, остаточным риском и ближайшим шагом.
В конце укажи фактическое выполненное, непроверенное и commit/push status.
Остановись на границе карточки; не реализуй весь этап.
```

## Контекст v1.2

Источник — последний gmail-ai-assistant-main.zip: Chrome + существующий Node Discord bot + Firestore. Сначала GITHUB_BASELINE, не старый BASELINE. Зберігай обидва lockfile та поточний набір test/ (docs/TESTING.md); поддерживай оба contract.js и rules согласованно. Для S09 читай discord-bot/queue-contract. Не пересоздавай бота. Parcel/barcodes/retry вже реалізовані; перевірити чинні контракти й регресії; register/start/deploy не выполнять как локальную проверку. OWNER-D01: почтовые ответы только с проверкой человека; /todo done не email approval.
