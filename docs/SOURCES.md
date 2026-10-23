# Источники, происхождение и границы применимости

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Дата обращения к официальной технической документации: 9 октября 2026 года. Возможности установленного пользовательского клиента отдельно не проверены. Цены, доступность конкретной модели и условия аккаунта не фиксировались.

## A. Материалы пользователя

`gmail-ai-assistant.zip` — источник фактических исходников и metadata. Хеши, объём проверки и наблюдения: [BASELINE.md](audit/BASELINE.md), [source-inventory.json](audit/source-inventory.json).

Предоставленные `00_READ_FIRST.md`, `AGENTS.md`, `AGENT_START_RU.txt`, `CURRENT.template.md`, `COPILOT_SETUP_RU.md`, `copilot-instructions (1).md`, `README.md`, `START_HERE.html`, `WORKFLOW_RU.md` другого проекта — образцы организации. Их стек, business rules и статусы не переносились. Сопоставление: [REFERENCE_MAPPING.md](audit/REFERENCE_MAPPING.md).

## B. Официальные внешние источники

| ID | Документ | Что использовано |
|---|---|---|
| S-VSCODE-INSTRUCTIONS | [VS Code: Custom instructions](https://code.visualstudio.com/docs/agent-customization/custom-instructions) | Форматы, область и проверка обнаружения инструкций; зависимость от harness |
| S-GITHUB-INSTRUCTIONS | [GitHub: Repository instructions in IDE](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide) | `.github/copilot-instructions.md`, path-specific файлы, References |
| S-VSCODE-AGENTS | [VS Code: Custom agents](https://code.visualstudio.com/docs/agent-customization/custom-agents) | Формат `.agent.md`, frontmatter и tool selection |
| S-CODEX-AGENTS | [OpenAI: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | Цепочка project instructions и overrides |
| S-CODEX-CONFIG | [OpenAI: Config reference](https://learn.chatgpt.com/docs/config-file/config-reference) | Project/user config и допустимые sandbox/approval keys |
| S-CODEX-BASIC | [OpenAI: Config basics](https://learn.chatgpt.com/docs/config-file/config-basic) | Отдельные настройки model/approval/sandbox |
| S-CODEX-SECURITY | [OpenAI: Approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security) | Permissions, command network и различие sandbox/approvals |
| S-CODEX-IDE | [OpenAI: IDE settings](https://learn.chatgpt.com/docs/ide/settings) | Codex config и editor settings как разные слои |
| S-CODEX-SKILLS | [OpenAI: Build skills](https://learn.chatgpt.com/docs/build-skills) | SKILL.md, metadata, локальный `.agents/skills` |
| S-CHROME-SCRIPT | [Chrome: scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting) | Сериализация `func`, `args`, MAIN/ISOLATED |
| S-CHROME-LIFECYCLE | [Chrome: service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) | Непостоянство worker и необходимость восстановления состояния |
| S-CHROME-STORAGE | [Chrome: storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) | Области storage и доступ к данным |
| S-GMAIL-LIST | [Google: users.messages.list](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list) | Pagination, IDs и nextPageToken |
| S-DRIVE-ERRORS | [Google: resolve Drive errors](https://developers.google.com/workspace/drive/api/guides/handle-errors) | Различные причины API errors, а не общий stale-token fallback |

Часть старых OpenAI Developers URL при открытии перенаправилась на `learn.chatgpt.com`; здесь указаны фактически доступные адреса. Содержимое внешних страниц не включено целиком.

## C. Что источники не подтверждают

Ни один внешний источник не определяет бизнес-политику конкретного depot, право менять DELIVERED/OFD, календарь рабочих дней организации, допустимость обработки клиентских накладных AI или наличие пользовательских credentials. Эти сведения требуют владельца и разрешённого стенда.

53 карточки версии v1.2, порядок приоритетов, naming/journal proposals и workflow — результат проектирования по исходникам и запросу пользователя, а не цитата из API документации. Их статус и допуски должны оставаться явными.

## D. Новый источник v1.2 и пределы этого обновления

Владелец предоставил `gmail-ai-assistant-main.zip` для включения имеющегося Discord-бота. Этот архив теперь базовый для фактов о runtime, а первый ZIP — исторический. Hash, файлы, функции и область проверки: [GITHUB_BASELINE](audit/GITHUB_BASELINE.md) и [source-traceability](audit/source-traceability.json).

Из этого кода взяты command names/options, queue schema/defaults, config paths, dependency versions, render limits, checks и incomplete modes. Целевые требования recovery/пилота явно обозначены как план. Ссылки на внешнюю документацию выше сохранены из v1.1; в данном обновлении их содержание повторно не проверялось, новые claims о текущих тарифах/лимитах/версии IDE не добавлялись.

Не переносить из source comments утверждения про бесплатные Maps quotas, вечный lifetime offscreen или полную надёжность UID в качестве подтверждённых внешних фактов. Поручение касается согласования MD с приложенными исходниками.
