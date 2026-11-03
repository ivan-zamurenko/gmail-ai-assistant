# Совместимость и последовательность изменений данных

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


В этом проекте нет установленной серверной SQL-БД и Alembic. Слот миграций из эталона заменён описанием evolution Firestore tasks/todos/rules, локальной конфигурации, возможного journal и build artifacts. Существующие browser storage keys не предполагать без проверки callers нового кода. **Ни одной миграции данных этот комплект не выполняет.**

## Где действительно нужна совместимость

| Область | Карточка | Контроль до изменения | Что нельзя делать |
|---|---|---|---|
| Config/storage ошибки | S01-05 | Перечень реально существующих keys, partial update, failure handling | Удалять неизвестные значения и secrets при сохранении формы |
| Naming policy | S02-03 | Подтверждённый источник даты, policy version и список changed semantics | Переименовать существующий Drive целиком по новой версии |
| Drive plan snapshot | S04-02 | Версия plan DTO, remote metadata и stale detection | Считать сохранённый план вечным разрешением |
| Job state | S04-03 | Выбор execution context, state version и restart strategy | Заменить journal одним volatile promise в popup |
| Lease/recovery journal | S04-04 | Разрешённые transitions, read compatibility, uncertain recovery | Стереть applying/uncertain state ради чистого UI |
| Draft operation record | S05-05 | Message/thread/proposal identity, partial effects, privacy | Объявить локальный key серверной idempotency гарантией |
| Extension artifact | S08-02 | Manifest identity/version, required assets, allowlist | Менять key/client ID или переносить private examples в ZIP |
| Downgrade/rollback | S08-04 | Чтение нового state старой версией на synthetic profile | Downgrade, который молча уничтожает journal |

## Порядок одной storage миграции

Сначала прочитать фактические keys и их callers, используя synthetic fixtures вместо экспорта рабочего профиля. Описать old/new schema, version marker, default для отсутствующего поля, поведение при unknown version и способ повторного запуска.

Затем написать tests: пустое хранилище, текущая версия, предыдущая версия, частично записанное состояние, ошибка записи и повтор миграции. После этого — минимальная миграция с сохранением незатронутых данных. Downgrade поддерживается только в явно проверенном диапазоне; не обещать универсальную обратимость.

Изменяющие Chrome storage операции не атомарны с Google/depot запросом. Crash между сохранением intent и external response требует recovery/reconcile. Успешная локальная запись не является доказательством выполнения remote effect.

## Владелец изменений

Один integrator изменяет shared schema, lockfile, state и migration order. Два writer не вводят конкурирующие версии без согласованного контракта. Реальные retention/export/deletion правила требуют G_PRIVACY и не выбираются автоматически из удобства реализации.

## Firestore и два runtime

S09 изменения не создают новую БД: используются существующие tasks/todos. Перед изменением schemaVersion, args, ACK/result fields описать bot/extension version matrix, совместимые rules и rollback. Producer и consumer не должны начать говорить на разных протоколах при раздельном выпуске.

Не переприсваивать executorUid у claimed задачи без сверки её внешнего исхода. Не очищать tasks/todos массово как migration step. Retention и доставка terminal reply — S09-04; browser rules — S09-03; lifecycle — S09-05. Локальные config файлы нового снимка импортируются статически; не мигрировать несуществующий src/storage по старой карте.
