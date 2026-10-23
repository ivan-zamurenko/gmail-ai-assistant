# Discord и очередь — матрица проверок

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](../audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

Это требования к развитию существующего бота, не список уже пройденных тестов. Текущие suites находятся в `test/`; реестр защищённых рисков — `docs/TESTING.md`. Documentation-only kit не является полным security audit. Фактические результаты текущей сессии — [UPDATE_V1_2](../audit/UPDATE_V1_2.md).

## Уровни доказательств

`source` — чтение конкретного обработчика; `offline` — выполнение подставных Chrome/fetch/Firestore границ; `emulator` — реально исполняемые Firestore rules в локальной среде; `browser` — собранный artifact в Chrome; `authorized integration` — конкретный разрешённый guild/project/depot. Один уровень не подменяет другой.

## Проверяемые группы

| Группа / карточка | Положительные сценарии | Отрицательные и recovery | Требуемый уровень |
|---|---|---|---|
| Contract S09-01 | Оба mirror одинаковы; schema 2 и supported modes | Неверная версия/command/номер/dryRun не достигают injection | Offline |
| Admission S09-02 | Разрешённый guild и Admin для depot, личный todo | Чужой guild, нет прав, malformed options, no live confirmation | Handler fixtures |
| Rules S09-03 | Назначенный UID: read/claim/result | Чужой/неавторизованный UID, create/delete, изменение args, oversized result, terminal rewrite | Emulator, не regex |
| Delivery S09-04 | Terminal result доставлен и подтверждён отдельно от execution | Потерянный editReply; restart бота; нет слепого повторного reschedule | Offline + Emulator |
| Listener S09-05 | Один claim, serial execution; sender boundary | Два listeners, повтор event, restart claimed, истечение pending, ошибочная identity | Offline + browser |
| Find S09-06 | Single/multi parcel, последний scan, 12 history rows | Нет scans, out-of-order, invalid time, длинный field, отсутствие full identity fields | Offline renderer + browser review |
| Geo S09-07 | Valid Eircode, distance, optional PNG | Нет key/drop; fetch rejection/timeout/non-2xx/invalid JSON; основная карточка сохраняется | Stub network; live только отдельно |
| Todo S09-08 | add/list/done/clear в рамках userId | Чужой пользователь, неверный number, concurrent reorder, huge text, удаление только done | Offline + Emulator |
| CAD S09-09 | Общая policy popup/bot, preview identity | Изменился контекст после review; повтор command; неопределённая запись; другая вкладка | Offline; live под допуском |
| Parcel S09-10 | Один номер и согласованная дата | Невозможная дата, чужой preview, ambiguity, replay | Offline существующего режима; live отдельно |
| Barcodes S09-11 | Verified set -> preview -> разрешённый apply | disputed/unknown, scan filing vs reschedule, повтор запуска и partial writes | Offline существующего режима; live отдельно |
| Пилот S09-12 | todo + find + разрешённый CAD; UID/rules | Недоступный runner, отказ Maps, lost reply, неразрешённый actor | Authorized integration |

## Существующие product suites — сохранить

Существующие `test/bot/`, `test/queue/`, `test/depot/` и `test/utils/` покрывают команды, validation, render, errors, queue и depot/labels/recovery. Bot tests импортируют production modules и требуют bot dependencies. Точные cases и границы доказательств описаны в `docs/TESTING.md`.

Не создавать параллельный `tests/` вместо принятого `test/` и не удалять существующие cases. Любой перенос требует явного соответствия case→case и доказательства запуска. Новые проверки нельзя считать пройденными на основании их названий в таблице.

## Історичні probes

`checks/baseline/` та `checks/github/offline-discord.probe.mjs` збережені лише
для відтворення старого source snapshot. Їхні очікування не відповідають поточним
parcel/barcodes/full-card можливостям, а Drive VM linker — нинішнім залежностям.
Вони не входять у поточний gate. Для історичного відтворення слід явно задати
`DPD_SOURCE_ROOT` на окрему копію відповідного snapshot, не на робочий checkout.
Поточні докази: `npm test`, `test/` і `tools/tests/`.

## Evidence и допуск

Для каждого результата сохранить команду, cwd, exit code, версии, fixture/emulator/browser boundary и непроверенное. В integration evidence — только aliases окружения, задача, safe state/result, типы разрешённых данных. Токены, service-account JSON, реальные email/parcel data и полный interaction payload в evidence запрещены.

Parcel/barcodes/retry уже реализованы. S09-12 не подтверждает их live-готовность автоматически; перед пилотом определяют разрешённый набор сценариев, не отключая режимы по исторической документации. Готовность Gmail review определяется S06-05, не `/todo done` и не этой матрицей.
