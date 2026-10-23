# Discord + Firestore + Chrome — порядок подготовки и эксплуатации

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](../audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**Основание:** исходники нового ZIP и `docs/SECURITY.md` в нём. Это описание процедур, не выполненная установка. Токены, клиентские данные и реальные идентификаторы окружения в этот файл не вписывать.

## 1. Что должно работать одновременно

Для `/find` и `/reschedule all|parcel|barcodes|retry`: отдельный процесс бота; Firebase project с ожидаемыми правилами; расширение из `dist/`; offscreen listener с привязанным UID; рабочая авторизованная depot-вкладка. Бот не логинится в depot вместо пользователя и не заменяет Chrome.

Для `/todo`: бот и Firestore, без depot. Для карты: отдельный Google Maps key и разрешение на геоданные; отсутствие карты не должно блокировать базовый lookup после S09-07. Не обещать доступность цен/квот по старым комментариям.

Сначала S00-01 сверяет настоящий checkout. Предоставленный GitHub ZIP не содержит `.git`, поэтому его имя не подтверждает branch/head. Не создавать origin или checkout новой main автоматически.

## 2. Два набора зависимостей

Из корня настоящего репозитория, не из documentation-only ZIP:

```sh
node --version
npm --version
npm ci
npm --prefix bot ci
npm run lint
node --test test/bot/*.test.js test/queue/*.test.js test/utils/*.test.js
npm test
```

Нужны и root, и `bot/package-lock.json`: root tests импортируют bot commands/render, а те — `discord.js` из bot dependencies. Отсутствующий discord.js означает проблему установки, не функциональный RED. `npm test` уже существует; S00-03 сохраняет существующие suites `test/`; реестр и защищённые риски перечислены в `docs/TESTING.md`.

Сетевой доступ registry и install scripts разрешать отдельно для dev-среды. Не менять lockfiles ради обхода ошибки платформенного бинарника. Бот не запускается командами тестов по проектному требованию; проверять import-time side effects нового test harness.

## 3. Конфигурация — раздельные границы

| Файл в настоящем checkout | Поля | Ограничение |
|---|---|---|
| `src/config/local.js` из `local.example.js` | `geminiApiKey`, `driveFolderId`, `firebase.apiKey`, `firebase.projectId`, contact | Статически импортируется extension config; значения могут оказаться в bundle. Не класть сюда bot credentials |
| `bot/config/local.js` из bot template | `discordToken`, `applicationId`, `guildId`, `firebase.serviceAccountPath`, `firebase.executorUid`, optional `googleMapsApiKey` | Только server-side бот; реальные значения не включать в Git/ZIP/evidence |
| Service-account JSON по указанному пути | Credential Firebase Admin | Разрешения IAM и локальный доступ ограничить; не копировать в `src` или `dist` |

`serviceAccountPath` разрешается относительно `bot/`, не произвольного cwd. `loadConfig()` бота требует token/application/guild, path и executorUid. Он не предоставляет в этом снимке универсального env-based config API; не документировать несуществующие `DISCORD_TOKEN` как уже поддерживаемый способ запуска.

Template copying делать только при отсутствии целевого local.js, без перезаписи. Сам перенос документации не должен создавать файлы с production credentials. Публичные app/project/UID identifiers не равны токенам, но их не нужно печатать в общий отчёт.

## 4. Сборка расширения

`src/config/config.js` импортирует отсутствующий в ZIP `local.js`; без подготовки допустимой локальной конфигурации build может упасть. Для offline build использовать только synthetic/пустые допустимые значения и не загружать такой bundle в рабочий профиль.

```sh
npm run build
```

Команда заново создаёт `dist/`; убедиться, что там нет ручной работы. Сборка включает popup, background и offscreen. Load unpacked — `dist/`, не корень. Bot runtime не включается в browser bundle. Проверить отсутствие server account/token в артефакте прежде передачи.

## 5. Привязка executor и rules — только разрешённая среда

В разрешённом тестовом профиле offscreen использует anonymous Firebase Auth и печатает `Firebase executor UID`. Сверить этот UID с `firebase.executorUid` бота, а Firebase project расширения — с project service account. UID не является токеном. Очистка профиля может потребовать новой привязки: не копировать старый ID по предположению.

До live-проверки подтвердить, что rules относятся к выбранному project и реально применены. `firebase.json` задаёт путь `firestore.rules`, но не доказывает выбранный deployment target. Сначала Emulator по S09-03; prod rules нельзя менять по одному поручению редактировать Markdown.

В исходном security runbook есть команда `firebase deploy --only firestore:rules`. Это внешний write и здесь намеренно не входит в обычную последовательность установки. Перед её исполнением требуется отдельный допуск с проверенным project, diff правил и планом отката.

## 6. Регистрация и запуск бота — внешние действия

После G_DISCORD_ACCESS и разрешения конкретного тестового guild:

```sh
npm --prefix bot run register
npm --prefix bot start
```

`register` делает REST PUT набора guild commands; это не read-only проверка и не подготовка локального файла. Сохранить предыдущую схему команд для rollback; не запускать register в рабочем guild как побочный эффект CI. `start` подключает бота, а не просто проверяет синтаксис.

Не считать успешный login готовностью depot runner. Начать с `/todo` на synthetic text, затем разрешённый `/find`, затем отдельно немутирующий CAD preview. Не использовать реальный номер как публичный пример документации. Live reschedule не нужен для проверки Copilot/Codex. Во всех reschedule режимах default — dry-run; явный dry_run:false подтверждает live без confirm_live. Barcodes сообщает progress приватно, итог — в DM оператору; недоставка сообщения не даёт разрешения повторять depot action.

## 7. Диагностика без повторных внешних эффектов

| Симптом | Проверить | Чего не делать |
|---|---|---|
| Config error или module not found | Оба install, существование локальных файлов без печати их значений | Не подставлять чужие credentials |
| Команда отсутствует | Утверждённый guild, актуальная command schema и register evidence | Не регистрировать глобально вслепую |
| Pending не захватывается | bot executorUid, Firebase identity listener, project/rules, истёкший deadline | Не снимать UID filter |
| Claimed и timeout | Chrome/depot, была ли начата операция; сохранить task ID и safe phase | Не повторять live-команду автоматически |
| Результат есть, Discord reply не доставлен | Доставка и состояние terminal record; текущая реализация может удалить запись рано | Не повторять depot action ради новой карточки |
| Карта упала | Optional Maps path, ключ/допуск без печати ключа; базовый lookup отдельно | Не объявлять lookup отсутствующим только из-за Maps |
| `/reschedule parcel` или `barcodes` возвращает error | Оба режима реализованы: проверить валидность номера/даты, offscreen DOM, Drive auth и совместимость bot/extension | Не обходить dispatcher через ручной unsafe script |
| `/reschedule retry` не находит партию | Повторяется только сохранённая партия текущего дня; предыдущая истекает | Не создавать новую live-команду для неопределённого результата |

## 8. Остановка и возврат

До операционного внедрения определить управляемую остановку приёма новых задач, исход claimed, сохранение terminal results и порядок очистки по G_PRIVACY. В текущем коде не обнаружен отдельный `/pause` или централизованный kill switch; не рекламировать его как готовую команду.

Остановка процесса бота сама по себе не доказывает отмену уже захваченной задачи в расширении. При инциденте сначала выяснить phase; изменение dates сверять с depot. При rollback сохранять совместимость bot/extension/schema/rules и не менять extension identity.

Тестовый пилот: S09-12. Общий выпуск: S08-03/S08-04. [Матрица тестов](TEST_MATRIX.md) · [Текущий контракт](../queue-contract.md).
