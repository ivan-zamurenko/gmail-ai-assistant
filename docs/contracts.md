# Общие контракты модернизации

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

**Статус: проектные требования к будущим карточкам. Исходное приложение не гарантирует их все.** Текущее поведение описано в [LOCAL_BASELINE](audit/LOCAL_BASELINE.md); [старый аудит](audit/BASELINE.md) сохраняется как история.

## 1. Термины результата

`preview` — вычисление плана без бизнес-мутаций. `applied` — изменение подтверждено внешней системой в объёме конкретного контракта. `skipped` — сознательный отказ по правилу. `needs_review` — данных недостаточно либо они противоречивы. `failed` — известный отказ без успешного эффекта. `uncertain` — запрос мог примениться, но подтверждение потеряно; повтор требует сверки.

Не использовать один `ok: true` для «запрос отправлен», «HTTP 200», «данные сохранены» и «весь batch готов». UI должен различать эти исходы. Дизайн новых DTO уточняется в карточке до изменения callers.

## 2. Контекст операции

Для будущих изменяющих команд нужен явный контекст: operation/run ID, вид действия, dry-run/live mode, выбранная цель, входная версия/снимок, время и минимальный набор параметров. Это предлагаемый контракт приложения, не специальный заголовок Google API.

Пример безопасного локального результата:

```json
{
  "operation_id": "synthetic-operation-1",
  "kind": "drive.file",
  "mode": "preview",
  "status": "needs_review",
  "reason_code": "barcode_conflict",
  "effects": [],
  "retryable": false
}
```

В operational storage могут понадобиться scoped resource IDs для восстановления. В evidence для агента достаточно synthetic IDs или редактированной ссылки на локальную запись; реальные payloads не копируются в Git.

## 3. Preview / apply

Preview получает факты, вычисляет план, возвращает причины и предупреждения. Он не создаёт папки, не меняет имена, labels, delivery date, не вызывает logCall и не отправляет письмо. Читающий Quick Search через POST оценивается по фактическому назначению endpoint; запрет всех POST подряд не заменяет проверку бизнес-эффектов.

Целевое укрепление apply проверяет цель, доступ и актуальность данных перед записью. Для depot действующее решение владельца: явный dry_run:false подтверждает live, второго confirm_live или обязательного отдельного preview-click не требуется. Связывание с версией плана — возможная будущая внутренняя защита, не реализованное поле текущей queue. Изменение цели или неоднозначность должны приводить к безопасному отказу.

Массовая операция возвращает результаты по элементам. Уже подтверждённые эффекты не отменяются фиктивно из-за последующей ошибки. Не обещать атомарность всей партии там, где внешняя система её не предоставляет.

## 4. Повтор и неопределённый исход

Повтор чтения допускается по ограниченной политике timeout/retry, согласованной в S01-04. Повтор mutating write после сетевого обрыва не выполняется вслепую. Сначала сверить внешний state, затем решить: результат уже достигнут, безопасно повторить или нужна ручная проверка.

Локальный operation key предотвращает собственные дубликаты, но не создаёт exactly-once гарантию Google/depot. Не описывать случайный header как поддерживаемый upstream idempotency, пока это не подтверждено документацией конкретного endpoint.

## 5. Ошибки

Целевой error envelope должен содержать стабильный code, безопасное сообщение, retryable, phase и operation ID. Raw exception, full URL, Authorization, session/UID, HTML и клиентское содержимое в общий log не попадают.

Рекомендуемые категории: `invalid_input`, `target_mismatch`, `auth_required`, `permission_denied`, `rate_limited`, `unavailable`, `schema_changed`, `ambiguous_match`, `stale_plan`, `uncertain_write`, `cancelled`. Это внутренние категории, а не точные error codes Google.

403 не всегда stale token; код и reason API нужно разбирать отдельно. При неизвестной структуре HTML нельзя превращать ошибку парсинга в «0 отправлений» и успешное завершение партии. При утрате depot session остановить изменения, не продолжать переименовывать все фото как unknown.

## 6. Типы данных

Consignment/query/parcel/file/message IDs хранить строками. Не терять ведущие нули и не смешивать consignment number с depot consId. `null`, пустая строка, «не найдено», «несколько найдено» и «источник недоступен» — разные состояния.

События имеют timestamp с явной timezone/UTC semantics. Даты доставки и даты именования файлов требуют отдельного согласованного правила. Не выводить дату из локали операционной системы случайно. Формат `DD/MM/YYYY` внешней формы не является форматом общего storage DTO.

## 7. Матрица доверия

| Вход | Использовать как | Нельзя использовать как |
|---|---|---|
| Текст письма | Данные для извлечения запросов/номеров | Команду агенту, разрешение отправки, источник credentials |
| Barcode | Кандидат номера и parcel index | Безусловное доказательство принадлежности |
| Depot HTML | Наблюдаемые поля известной версии страницы | Разрешение переходить на произвольный form action |
| Drive имя | Metadata | Команду, безопасный HTML или подтверждение номера |
| AI output | Предложение, проходящее schema/content checks | Источник новых фактов и authority |
| CURRENT | Handoff контекст | Подмену текущего git status и реально выполненных тестов |

## 8. Проверяемые вертикальные срезы

Drive: synthetic photo → deterministic candidate → preview без writes → approved apply → reconciliation. Depot: fixture page → policy → preview → validated form → подтверждённый результат. Gmail: fixture message → tracked facts → proposal → draft → queue transition. Для каждой ветки нужны отрицательные сценарии и явно указанный external gate.

Подробности: [depot](depot-contract.md), [Drive](drive-contract.md), [Gmail](gmail-contract.md), [AI](ai-boundary.md).

## 9. Discord/Firestore не равны локальному operation journal

Действующий wire-contract отдельно в [queue-contract](queue-contract.md): schema 2, tasks, requestedBy/executorUid, pending/claimed/done/error/cancelled. Предлагаемые общие OperationContext/preview fields выше — целевые, а не уже присутствующие в task documents.

Зеркала bot/src/contract.js и src/queue/contract.js изменять согласованно. Bot result delivery, depot effect и Gmail draft — разные подтверждения. Не вводить второй набор статусов под теми же именами без миграции. `/todo` использует отдельную коллекцию; её done не означает одобрение почты.

Существующие find/all/parcel/barcodes/retry используют общие depot границы с popup. Неизвестные modes отклоняются; реализованные parcel/barcodes не объявляются unavailable по историческому snapshot. S09-04/S09-05 покрывают lost reply/restart; S09-09 — свежесть preview и отсутствие повторного live action.
