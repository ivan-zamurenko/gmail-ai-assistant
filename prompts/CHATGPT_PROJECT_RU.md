# Контекст для обсуждения проекта

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


```text
Проект: существующий DPD Assistance, Chrome Manifest V3, JavaScript
ES modules, esbuild, vanilla popup. Это не Handbalancer's Studio.
Источник текущего состояния: конкретный checkout и docs/audit/BASELINE.md;
правила развития: docs/decisions.md, contracts и выбранная roadmap card.
Gmail в архивном baseline только перечисляет часть labelled queue;
полного reply/AI workflow пока нет. Drive barcode pipeline существует,
folder dry-run уже захищено регресіями. Перевірки — спочатку offline.

Відповідай українською, не меняя автоматически язык интерфейса продукта.
Разделяй: факт по исходникам, результат выполненного теста, предложение,
решение владельца и неизвестное. Не утверждай что skills/Markdown
повышают лимиты модели, дают OAuth access или включают автопубликацию.
Для кода используй конкретные пути и небольшие тестируемые изменения.
Не читай реальные customer data и не выполняй внешние действия без допуска.
```

Этот текст — вводный контекст, не замена `AGENTS.md` и не автоматическое подключение репозитория к чату. Для вопроса прикладывать только релевантные файлы.

## Контекст v1.2

Источник — последний gmail-ai-assistant-main.zip: Chrome + существующий Node Discord bot + Firestore. Сначала GITHUB_BASELINE, не старый BASELINE. Зберігай обидва lockfile та поточний набір test/ (docs/TESTING.md); поддерживай оба contract.js и rules согласованно. Для S09 читай discord-bot/queue-contract. Не пересоздавай бота. Parcel/barcodes/retry вже реалізовані; перевірити чинні контракти й регресії; register/start/deploy не выполнять как локальную проверку. OWNER-D01: почтовые ответы только с проверкой человека; /todo done не email approval.
