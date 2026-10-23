# Depot: lookup, CAD и изменение даты

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

## 1. Наблюдаемый интерфейс исходников

`depotLookup(numbers)` возвращает массив результатов по каждому query. При успехе присутствуют `ok`, `consNumber`, `status`, `arrangedDate`, `lastScan`, `scanCount`, `address`. При нескольких совпадениях возвращается `ok: false` и строка `reason`; при отсутствии scan history возможен `consNumber` вместе с `ok: false`.

`depotMain` получает Pending List только для CAD; labels использует переданные точные targets, а parcel — найденную точную цель и выбранную дату. Результат неоднороден: dry-run count, summary changed/skipped/errors, warning либо `__error`. Это текущая форма ответа, не образец для дальнейшего расширения без DTO.

`mode='labels'` использует точные verified targets без Pending List. Popup/Discord barcode orchestration проверяет номер и физическую parcel identity через lookup, затем передаёт подтверждённые цели общему reschedule. Сам Drive adapter отвечает за чтение/filing, а не дублирует depot policy.

## 2. Цель и границы injection

До вызова проверить разрешённый hostname/path, tab ID и признаки ожидаемой страницы. Внутри injected функции повторно проверить critical DOM/session prerequisites. Переходы по ссылкам и form action ограничить ожидаемым origin и разрешённым маршрутом.

**Реалізовано (S01-02, 2026-10-23):** правило вкладки — `src/depot/depotTarget.js`
(`http:`, host строго під `.interlink.local` з `DEPOT_URL_PATTERN`, без `user:pass@`).
Popup перевіряє активну вкладку перед кожною ін'єкцією, executor повторно фільтрує
вкладки з `tabs.query`. `depotMain` і `depotLookup` повторюють перевірку на сторінці
(навігація між перевіркою і ін'єкцією) і пропускають кожен fetch/form action через
`sameOrigin`: чужий origin відхиляється до відправлення session/hidden fields.
Маршрут (path) не обмежується — реальні depot URL окремо не підтверджені. POD API
викликається з розширення (`podImage.js`), не з MAIN.

Функция должна быть self-contained после serialization. Выделенный helper нельзя просто импортировать сверху: Chrome не переносит внешнее closure. Для тестов использовать независимый контекст выполнения и собранную версию; данные передавать явно через сериализуемые args. [S-CHROME-SCRIPT](SOURCES.md)

Google OAuth token, Gemini key, carrier key и содержимое других писем не передаются в MAIN. Session страницы используется только для работы разрешённых depot endpoints и не возвращается в popup/result/log.

## 3. Lookup: идентичность и факты

0 совпадений → `not_found`; несколько → `ambiguous`; недоступная форма/session → `unavailable` или `schema_changed`. Наличие consNumber без scans разрешает отдельно показать «отправление найдено», но не даёт права утверждать last status или delivery promise.

Текущий `latest(scans)` сортирует по распарсенным дате/времени. Требуется проверить invalid dates, одинаковые timestamps, порядок строк, пустые ячейки и локаль. Если timestamp невалиден, результат не должен молча становиться «последним».

Адрес и contact возвращаются текущим кодом, но дальнейшие consumers должны запрашивать/передавать только нужные поля. Проверке существования номера для Drive обычно не нужен полный адрес клиента. Это сокращение payload выполняется отдельной карточкой с compatibility tests.

## 4. Статусы и дата: gate, а не догадка

Текущая ветка `DELIVERED/OFD/PENDING → CHANGE_DATE` и правило GOODS HELD должны быть подтверждены владельцем в таблице policy. Пока G_DEPOT_POLICY pending, допустимы characterization tests старого поведения и разработка pure policy на synthetic cases, но не live-включение новой трактовки.

G_CALENDAR определяет timezone depot, cut-off, нерабочие даты, исключения и источник обновлений. Список 2026 в исходнике не переносить как бесконечный календарь. Неизвестный год должен давать понятный blocker, а не считать все будние дни рабочими.

## 5. Полноценный preview

Текущий CAD Dry Run возвращает количество и список packages после фильтра route, но не проходит detail/classify. Следовательно, «would be processed» не равно «дата будет изменена у всех». Целевой preview показывает причины по каждому parcel, старую и целевую дату, источники фактов и предупреждения.

Ни logCall, ни reschedule во время preview не выполняются. Читающий поиск через POST может входить в preview только после подтверждения, что endpoint не изменяет бизнес-данные. Повтор после изменения status/session должен обновить preview.

## 6. Формирование и подтверждение записи

Сохранять исходные поля формы: hidden fields, повторяющиеся names, отмеченные controls и требуемые server tokens. Менять только разрешённые поля. Текущий код исключает disabled/buttons и изменяет action/arranged-date/arranged-by/arrange/btnSave; точный контракт проверяется на редактированной fixture формы, не на догадках.

Успех HTTP не равен сохранению даты. Неизвестный ответ, login HTML, banner без соответствующего сохранения, ошибка или timeout требуют отдельного исхода. При uncertain write сначала сверить detail/историю доступным разрешённым чтением, не отправлять Save снова автоматически.

`logCall` — самостоятельный эффект. Владелец должен решить, когда он нужен и что делать, если logCall успешен, а reschedule нет. Не добавлять fallback endpoint «на всякий случай». Ошибка logCall не должна скрываться как полностью успешная операция, если она является обязательной частью политики.

## 7. Обязательные сценарии

Неверная вкладка; чужой form action; отсутствующий Route header; пустая таблица против неожиданной HTML-структуры; 0/1/много Quick Search matches; найден номер без scans; invalid timestamp; разные status; неподдерживаемый год; preview без эффектов; stale status перед apply; сохранение всех полей; lost response после Save; частично выполненная партия.

Фикстуры синтетические или редактированные. Реальная depot-система используется только по G_TEST_ACCOUNTS и после подтверждения G_DEPOT_POLICY/G_CALENDAR. Cards: S01-02, S01-03, S03-01…S03-05.

## 8. Дополнительная точка входа — Discord queue

Новый executor уже переиспользует depotMain/depotLookup. `/find`, `/reschedule all`, `/reschedule parcel`, `/reschedule barcodes` и `/reschedule retry` подключены. Barcodes использует отдельный offscreen executor с общими depot ports. Поэтому изменения lookup/result policy влияют и на render.js бота, а не только popup.

В новом lookup есть также scans, drop и timing; runFind минимизирует их перед Firestore. Правила ограничений origin, неизвестного статуса и подтверждения apply обязательны для обоих входов. Явное dry_run:false является live-подтверждением; confirm_live отсутствует и не должен вводиться повторно. Проверка актуальных targets перед Save не требует второго подтверждения оператора. Сверять S03-04/S03-05 с S09-09, а не создавать отдельную более слабую depot policy для бота.
