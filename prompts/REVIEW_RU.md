# Проверка ограниченного diff без редактирования

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


```text
Проверь <TASK_ID> и diff относительно <BASE_SHA>.
Базу возьми из CURRENT и сверь с существующим Git ref; не угадывай.
Не изменяй код, tests, индекс Git, state и документацию.
Прочитай карточку, её acceptance, relevant callers и evidence.

Ищи: Drive mutations в dryRun, обход target/origin guards, потерю
ambiguous identifiers, неверные status/calendar decisions, stale plans,
повторы external writes, потерю journal, утечку session/customer data,
неверный recipient/thread, send без допуска, AI как источник полномочий,
ослабленные тесты и заявления о реальной интеграции по mocks.
Для injected functions проверь serialization, не только Node import.

Для каждого замечания дай severity, файл/место, сценарий и последствие.
Предложи узкий failing test, не общий redesign продукта.
Отдельно укажи реально просмотренное, выполненные проверки и непроверенное.
Нет находок не означает доказательство безопасности всех сценариев.
```

## Контекст v1.2

Источник — последний gmail-ai-assistant-main.zip: Chrome + существующий Node Discord bot + Firestore. Сначала GITHUB_BASELINE, не старый BASELINE. Зберігай обидва lockfile та поточний набір test/ (docs/TESTING.md); поддерживай оба contract.js и rules согласованно. Для S09 читай discord-bot/queue-contract. Не пересоздавай бота. Parcel/barcodes/retry вже реалізовані; перевірити чинні контракти й регресії; register/start/deploy не выполнять как локальную проверку. OWNER-D01: почтовые ответы только с проверкой человека; /todo done не email approval.
