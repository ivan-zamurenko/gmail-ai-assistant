# Gates: решения и реальные внешние проверки

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


Gate — конкретное недостающее решение/разрешение, а не универсальная причина остановить разработку. Локальные unit/fixture tests обычно возможны до внешнего допуска. Gate не равен выполненной интеграции: одобрение разрешает проверку, а её результат фиксируется отдельно.

## Реестр

| Gate | Что нужно подтвердить | Что блокируется | Что остаётся доступно |
|---|---|---|---|
| G_ARCHITECTURE | Глубина изменения существующих Chrome + Node bot + Firestore и жизненный цикл Drive runner | Существенный rewrite и новый runner | Локальные исправления, tests, docs |
| G_GMAIL_POLICY | Ручная проверка выбрана (OWNER-D01); ещё нужны exclusions, язык, labels, адресат/Reply-To и scope писем | Незавершённая draft policy и реальные письма; auto-send вне текущего scope | Message parser, review/draft fixtures |
| G_DEPOT_POLICY | Таблица статусов, разрешённые поля, logCall | Live reschedule и окончательная policy | HTML fixtures, target guards, сохранение формы |
| G_CALENDAR | Timezone, cut-off, нерабочие дни, источник обновлений | Рабочий date calculator | Synthetic clock/calendar tests |
| G_DRIVE_POLICY | Дата filing, unknown/contested и повторно названные файлы | Необратимое применение новых naming rules | Decoder tests и немутирующий preview |
| G_AI_PROVIDER | Provider/model, назначение, бюджет и разрешённый payload | Реальные model calls | Fake boundary, schema, safety dataset |
| G_PRIVACY | Данные, цели, retention, доступ, допустимые exports | Реальная передача и хранение клиентских данных | Synthetic fixtures, redaction tools |
| G_TEST_ACCOUNTS | Отдельные аккаунты/папки и разрешённый depot стенд | Внешние roundtrips | Offline tests и локальная сборка |
| G_RELEASE | Канал распространения, пилот, подтверждение rollback | Публикация и рабочее включение | Packaging и локальная проверка dist |
| G_GIT | Remote/branch и разрешённые Git writes | Push/merge и иные неразрешённые операции | Анализ diff, безопасные локальные изменения |

Все gates пока остаются `pending`. OWNER-D01 закрывает выбор ручной проверки, но не все вопросы G_GMAIL_POLICY и не разрешает внешние вызовы. Здесь не хранятся credentials и реальные customer fixtures.

## Закрытие gate

Владелец подтверждает конкретное решение/действие. Integrator записывает в `docs/decisions.md` основание и обновляет state: `status: approved`, непустой `evidence` с путём или понятной ссылкой на решение. Для отклонённого варианта — `rejected` и причина; не удалять историю отказа.

Selector только читает state. Он не умеет approve gates, запускать внешние проверки или повышать permissions. Если gate указан в карточке, next не считает её ready до approved. Проверить, что остальные зависимости уже выполнены в текущем checkout.

## `blocked` и `env_blocked`

`blocked` — недоступное продуктовое/техническое решение внутри scope. `env_blocked` — нет нужного Chrome, среды, разрешения или аккаунта. В обоих случаях записывается причина и ближайший шаг; ни один статус не заменяется на done только потому, что локальные mocks зелёные.

Если blocked карточка не мешает независимой ready-карточке, можно продолжить последнюю в разрешённом диапазоне. При активной `in_progress` selector сначала возвращает её и не скрывает незаконченную работу.

## Граница допуска

Разрешение тестовой папки Drive не разрешает весь Drive. Разрешение lookup не разрешает reschedule. Разрешение draft не разрешает send. Разрешение AI на synthetic examples не разрешает клиентские накладные. В evidence указываются разрешённый scope и реально выполненные эффекты без раскрытия данных.

## Дополнение v1.2 — Discord

| Gate | Что требуется | Что блокирует | Что не блокирует |
|---|---|---|---|
| G_DISCORD_ACCESS | Конкретный тестовый guild, Firebase project/executor, register/start/rules permissions, поля сообщений и операционные границы | S09-12: реальный roundtrip | Offline contracts, Emulator с синтетическими данными |
| G_DISCORD_MODES | Явное решение включать parcel/barcodes и точная семантика неподключённых режимов | S09-10/S09-11 | Проверка существующих find/all/todo |

G_PRIVACY расширен на Firestore, Discord ephemeral payloads и Maps, не считается approved. G_RELEASE учитывает одновременную совместимость bot/extension/rules. G_GMAIL_POLICY не разрешает Discord review; OWNER-D01 сохраняет ручную проверку и отсутствие auto-send. Всего 12 gates в поставляемом state; новые и прежние остаются pending.
