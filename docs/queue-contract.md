# Firestore queue — контракт бота и расширения

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**v1.2, локальная сверка.** Разделы 1–5 описывают текущий код; исходный ZIP сохранён как история. Разделы 6–8 задают требования к дальнейшим изменениям. Не путать существующие поля с будущим протоколом acknowledgement.

## 1. Участники и источники истины

`bot/src/contract.js` и `src/queue/contract.js` содержат одинаковые значения `COMMANDS`, `RESCHEDULE_MODE`, `STATUS`, `TASK_SCHEMA_VERSION=2`, `TASKS_COLLECTION='tasks'`. На extension-стороне объекты заморожены через `Object.freeze`; это различие реализации, не разные протоколы. Изменять mirror values и тесты совместимости одной карточкой. Не добавлять третий словарь в popup.

`tasks` — обмен запросом/результатом depot. `todos` — личные задачи Discord. Gmail `AI-Reply` — метка почтовой очереди. `.workflow/state.json` — состояние разработки. Совпадение слова task не означает, что это одна коллекция.

## 2. Текущая схема task document

| Поле | Автор | Значение и проверяемая граница |
|---|---|---|
| `id` | bot | UUID документа; создаётся заново для каждой `enqueueAndWait()` |
| `schemaVersion` | bot | 2; executor отклоняет несовпадение |
| `command` | bot | `find` или `reschedule` |
| `args` | bot | find: `{conId}`; reschedule: `{mode,dryRun}` либо ещё `{conId,newDate}` для parcel; modes: all/parcel/barcodes/retry |
| `requestedBy` | bot | Discord user ID из interaction; не источник дополнительных полномочий executor |
| `executorUid` | bot config | Назначенный Firebase Auth UID профиля расширения |
| `status` | участник перехода | `pending`, `claimed`, `done`, `error`, `cancelled` |
| `createdAt` | bot | serverTimestamp |
| `expiresAt` | bot | Deadline захвата, `Date.now() + claimWindowMs`; default 60 000 ms |
| `claimedAt` | extension | serverTimestamp при claim |
| `completedAt` | extension / bot timeout | serverTimestamp завершения/отмены |
| `summary` | executor/writer | Строка; `writeResult()` подставляет пустую, если не дана |
| `details` | executor, optional | Строка детализации CAD |
| `parcel` | executor, optional | Минимизированный lookup result, не полный depot HTML |
| `execMs` | offscreen, optional | Время обработки из offscreen; не метрика всей Discord-сессии |

Источники: `bot/src/queue.js`, `src/offscreen/offscreen.js`, `src/queue/executor.js`, `src/queue/barcodeExecutor.js`. Для barcode progress имеются progressStage/progressCurrent/progressTotal/progressMs/progressAt; это диагностика, а не подтверждение внешней записи.

## 3. Текущие переходы состояния

```text
bot creates pending
  -> extension transaction: claimed, если срок захвата не истёк
  -> extension transaction: done | error

pending + истёк deadline -> cancelled без depot execution
bot timeout: pending -> cancelled
bot timeout: claimed -> предупреждение о неподтверждённом результате, не повтор операции
```

Бот по умолчанию ждёт 5 минут, barcodes handler задаёт 2 часа; это не тот же срок, что 60-секундное окно claim. `expiresAt` — не продлеваемая lease для уже выполняющегося задания. После claim срок не управляет автоматическим перезапуском и не отменяет уже начатый reschedule.

Listener бота использует `onSnapshot`, не polling. Offscreen подписан на `executorUid == current Firebase user.uid`. `scheduled` и `serial` предотвращают одновременную обработку в пределах одного работающего offscreen-контекста. `claimTask()` транзакционно проверяет pending. Это не гарантия координации с пользовательским popup или сохранения памяти процесса после restart.

## 4. Фактические Firestore rules

По `firestore.rules`: browser читает только task с совпадающим authenticated UID. Browser create/delete запрещены. Update разрешён только для допустимого status transition с ограниченным набором изменённых полей. Для claimed barcode tasks разрешены ограниченные progress updates с allowlist стадий, счётчиками 0…10000 и progressMs до 7200000; это не разрешает менять args. Terminal result требует `summary` string длиной до 500, `details` при наличии string до 2000, `execMs` int от 0 до 7200000, `parcel` при наличии map.

Проверка `parcel is map` не валидирует вложенную схему, размер отдельных строк или отсутствие PII. Schema validation executor и tests нужны отдельно. Наличие file rule не доказывает его публикацию, а текстовый тест на наличие строки не доказывает enforcement: S09-03 проверяет rules в Emulator.

Бот использует `firebase-admin` и service-account credential. По комментариям и границе этой реализации Admin SDK использует IAM, а не browser rules. Поэтому guild/permissions/input checks и ограничение server credentials обязательны отдельно. `/todos` закрыта для browser; изоляция userId реализована в bot queries.

## 5. Runtime message boundary

Для find/all/parcel/retry offscreen посылает `{type:'execute', task}`. Barcodes выполняется в offscreen DOM и использует узкие background ports для Drive token, lookup, reschedule и локальной recovery storage. Worker принимает execute и keepalive; текущий callback аргумент `_sender` не проверяет. Executor валидирует schemaVersion, command, find/parcel number, parcel date и boolean dryRun; barcodeExecutor отдельно валидирует barcode task. Авторство UI/очереди, identity и возможность обойти admission gate требуют S09-05; не объявлять sender validation существующей только из-за принадлежности extension.

MAIN получает сериализованные аргументы depot, не Discord token или service-account key. `findDepotTabs()` ищет по `DEPOT_URL_PATTERN`; selection и safety injected code надо проверить для нескольких вкладок. Сейчас catch injection error может перейти к другой вкладке. Для mutating действий не считать любой exception доказательством отсутствия записи: безопасный preflight и неопределённый исход разделяются в S09-09.

## 6. Требования к delivery и recovery — ещё не реализованные гарантии

Целевое требование: сохранить operation ID и terminal result до подтверждения доставки или явного перехода в recoverable состояние. Уже существующая локальная recovery-очередь точных depot targets решает другую задачу: повтор server errors текущего дня без сканирования Drive. Она не является durable журналом доставки Discord replies и не гарантирует восстановление любого claimed task. Текущий `finishWithResult()` удаляет task до успешного Discord reply; S09-04 исправляет этот порядок с тестом потерянного `editReply`.

Не превращать повтор вывода сообщения в повтор depot command. Pending timeout, claimed timeout, успешное внешнее изменение с потерянным результатом и отказ показа в Discord — разные состояния. Нужны ограниченные attempts, actionable safe error и сверка внешнего результата. Exactly-once внешних depot writes не обещается.

Retention, очистка и доступ к журналу задаются явной конфигурацией и G_PRIVACY; здесь нет произвольно выбранного срока хранения клиентских данных. До live-допуска тестировать синтетическую политику на Emulator/fixtures и обозначать её тестовой.

## 7. Совместимость изменений

До добавления новых полей acknowledgement/preview сначала записать producer/consumer schema, правила старых и новых клиентов, порядок rollout и rollback. Затем обновить оба mirror-контракта, queue writer, listener, executor, rules, тесты и документацию. Не создавать SQL migrations для Firestore.

Несовместимые версии должны отказывать безопасно, без depot injection. Не удалять все `tasks` при обновлении. Смена executorUid не должна бесконтрольно передавать pending live-задачи новому исполнителю. Пока команда claimed с неопределённым исходом, повтор допустим только после сверки.

## 8. Definition of Done и ссылки

Локально: test data не вызывает live Firebase; mirror equality, unauthorized UID, изменённые args, expiry, duplicate listener, restart и lost reply имеют отдельные проверки. На стенде: подтверждён конкретный guild/project/executor, правила и ограничения проверены реальными отказами на разрешённых synthetic записях.

[Стадия S09](../roadmap/ROADMAP.md) · [Security](security-and-privacy.md) · [Runbook](discord/RUNBOOK_RU.md) · [Test matrix](discord/TEST_MATRIX.md).
