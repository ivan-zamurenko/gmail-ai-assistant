# DPD Assistance — Chrome, Discord и Firestore

**Комплект документации v1.2, 9 октября 2026 года.** Текущий источник: последний предоставленный `gmail-ai-assistant-main.zip`. Это описание кода из архива, не live-проверка GitHub или подключённых сервисов.

> В этом ZIP находятся Markdown, агентские инструкции и инструменты документации. Runtime расширения/бота не вложен. Переносить по [INSTALL_RU](INSTALL_RU.md), сравнивая существующие файлы. Не заменять рабочий `.workflow/state.json` исходным шаблоном.

## Что уже есть в исходниках

| Часть продукта | Реализованный путь | Граница фактической готовности |
|---|---|---|
| Chrome Manifest V3 | Popup, background, offscreen, esbuild; manifest 6.3.0.5 | Сборка и загрузка в рабочий Chrome в этом обновлении не проверялись |
| Discord `/find` | Очередь -> depot lookup -> статус, latest scans, адресная область и история | Код подключён; live-доступ не подтверждён |
| Discord `/reschedule all` | CAD обработка, default dry_run=true, отдельный confirm_live для live | Нет привязки подтверждения к конкретной версии preview |
| Discord `/reschedule parcel`, `/reschedule barcodes` | Команды и параметры уже объявлены | Исполнитель возвращает неподключённый режим; не называть готовыми |
| Discord `/todo` | add/list/done/clear личного checklist через Firestore | Не Gmail approval и не удаление всех незавершённых задач |
| Firestore queue | tasks с schema 1, executorUid, transaction claim; offscreen listener | Recovery claimed/lost reply нуждается в доработке |
| Maps в `/find` | Optional geocode/static map и расстояние по прямой | Зависит от config/доступа; ошибка enrichment пока может сорвать карточку |
| Drive | Локальный ZXing и filing фото из popup | Не переносится автоматически в offscreen; Dry Run перепроверять отдельно |
| Gmail | Поиск AI-Reply и message IDs первой страницы | Полного read -> AI -> review -> draft в исходниках ещё нет |

Подробные команды и информация: [Discord](docs/discord-bot.md). Поля, состояния и ограничения: [queue](docs/queue-contract.md). Источник фактов: [baseline нового архива](docs/audit/GITHUB_BASELINE.md).

## Схема исполнения

```text
Discord -> Node bot -> Firestore tasks -> offscreen listener
        -> service worker -> depot page -> result -> Discord reply

Discord /todo -> bot -> Firestore todos
Chrome popup -> depot/Drive; Gmail queue отдельно
```

Существующие ответы бота ephemeral, а не регулярная рассылка в общий канал. Это не отменяет передачу операционных данных Discord. `render.js` ограничивает историю 12 событиями; CAD details — 25 строками. Полный текст писем, AI proposals и кнопки approval через Discord не реализованы.

## Установка и проверки приложения

Из корня реального репозитория:

```sh
npm ci
npm --prefix bot ci
npm run lint
node --test test/security.test.js
npm test
npm run build
```

Установки требуют разрешённой dev-сети. Build требует корректного `src/config/local.js` из template и пересоздаёт dist; реальные секреты не нужны для offline проверки и не включаются в переносимый артефакт. Root security suite уже есть: четыре теста, часть импортирует bot-модули, поэтому нужна вторая установка.

Запуск бота и регистрация команд описаны отдельно в [runbook](docs/discord/RUNBOOK_RU.md). Они подключают реальные сервисы и не выполняются автоматически. Firestore rules сначала проверяются в Emulator; deployment — отдельный допуск.

## AI-ответы — решение владельца сохранено

**OWNER-D01: ИИ готовит ответ, человек проверяет и правит, одобряет конкретную версию, затем создаётся Gmail draft; отправляет человек в Gmail. Auto-send не входит в текущий объём.** `/todo done` и depot `confirm_live` это правило не заменяют. Discord не назначен интерфейсом проверки писем без отдельного решения. [Решение](OWNER_DECISION_GMAIL_RU.md).

## Разработка по карточкам

В плане **53 карточки, 10 стадий и 265 сценариев приёмки**. Старые 41 ID сохранены; добавлен параллельный поток S09 для существующего бота/Firestore. 12 новых карточек охватывают contracts, admission, rules, delivery, listener, render/geo/todo, CAD, условные режимы и пилот. Наличие реализации не закрывает проверку задачи автоматически; все поставляемые state entries — todo.

```sh
node tools/roadmap.mjs validate
node tools/roadmap.mjs next
node tools/check-docs.mjs
node --test tools/tests/*.test.mjs
```

Это команды комплекта, не тесты всего приложения. Начать с S00-01: сверить checkout и новый baseline. Перечень изменений v1.2: [UPDATE_V1_2](docs/audit/UPDATE_V1_2.md). Открытые допуски: [QUESTIONS_RU](QUESTIONS_RU.md).
