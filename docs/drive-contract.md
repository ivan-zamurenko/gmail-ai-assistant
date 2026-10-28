# Google Drive labels: чтение, preview и filing

> Узгоджено з локальним checkout 2026-10-23: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Архівні аудити описують історичні знімки. Вимоги roadmap нижче не означають реалізовані гарантії або дозвіл на live-запуск.

## 1. Текущий маршрут данных

`processLabels({folderInput, token, verify, dryRun, onProgress})` читает изображения указанной папки. Текущий путь: download → ZXing WASM-first с JavaScript fallback → проверка barcode/parcel → depot verify → date/naming → folder plan/apply → optional PATCH. Параметра testMode в текущем API нет.

`onProgress` использует состояния listing/downloading/reading/checking/filing/done. Результат элемента содержит `from`, `to`, `number`, `contested`, `error`. Реальной длительной очереди или transacted batch в исходнике нет.

**Текущая защита:** `src/depot/monthFolders.js` не создаёт отсутствующие YYYY/MM при dryRun; `processLabelBatch` не переносит фотографии в preview. Регрессии находятся в `test/depot/monthFolders.test.js` и `test/depot/labelBatch.test.js`. Дефект и probe старого ZIP исторические. З S01-01 Drive-адаптер винесено в `src/depot/driveLabels.js` (без DOM/ZXing; декодування — порт із `driveScanner.js`), а `test/depot/driveLabels.test.js` перевіряє кожен method/URL: у dryRun до Drive йдуть лише GET, depot lookup POST дозволений, live створює папки після verify і робить один PATCH.

## 2. Folder input и список

Принимать только корректный folder ID либо разрешённый Drive URL с извлечением ID. Невалидный ввод не превращать в произвольное выражение query. Открытие URL из поля не требуется. Empty input и неподдерживаемые формы ссылки возвращают validation error до сети.

Pagination должна читать все страницы с ограничением на повтор pageToken/размер партии. Shared Drive особенности проверяются отдельным сценарием и не считаются реализованными только по наличию Drive scope. Имя файла и createdTime — внешние metadata: проверять формат и не вставлять через `innerHTML`.

Размер изображения, MIME, число pixels и число decode attempts должны иметь явные границы. Огромный blob нельзя бесконтрольно декодировать в popup. Значения лимитов — инженерное решение карточки с тестами, не выдуманная квота Google.

## 3. Кандидаты barcode

ZXing возвращает текст/format/reads; `labelBarcode` извлекает number и parcel index. Частота повторов — эвристика исходного кода, не вероятность правильности. PDF417 priority — тоже существующая policy, а не гарантия.

Для нескольких номеров/parcel indexes формировать явный conflict. Проверка depot может подтвердить существование каждого кандидата, но не решает, какой относится к фото. Target policy для disputed/unknown файлов согласует G_DRIVE_POLICY. До этого тесты фиксируют конфликт, а live-переименование не считается разрешённым.

Legacy `labelParser.js` принимает другие текстовые форматы; он не является текущим decoder. Не объединять два parser автоматически. Требуется таблица форматов, callers и реальных допустимых примеров, без реальных адресов/номеров клиентов.

## 4. План именования

Текущий шаблон: `YYYY-MM-DD_number[-pNN][-N].ext` либо `YYYY-MM-DD_unknown-NNN.ext`. `dateOf()` сейчас использует начало `createdTime`; это наблюдение, а окончательную семантику даты определяет gate. Не обещать, что это дата доставки или съёмки.

Preview возвращает предполагаемое имя/путь и причины. Отсутствующие папки отражаются в plan без их создания. Проверять extension, already-named input, duplicate names, unknown numbering и несколько фото одного parcel.

Ранее отформатированное имя не служит доказательством актуальности: при повторной проверке имя и распознанный номер могут расходиться. В этом случае нельзя молча сохранять прежний verified-looking номер. S04-02 определяет outcome и согласованное действие.

## 5. Apply и ограничение эффектов

До записи повторно проверить выбранную root folder, parent/source file, plan и допуск. Создание папки, изменение имени и перемещение считаются мутациями. Изменения должны быть минимальными: не менять sharing, owner, permissions, содержимое изображения или нерелевантные metadata.

После неопределённого PATCH сверить file metadata и parents. Повторный запуск не должен наращивать суффиксы одного и того же уже выполненного действия. Google Drive допускает одноимённые объекты; собственный алгоритм имён не даёт глобальной гарантии уникальности при двух writer.

Проектный default — один writer на целевую папку. Если поддержка нескольких процессов нужна, определить coordination/reconcile, а не полагаться на in-memory Set. Journal хранит минимальные идентификаторы, исходное/целевое состояние и подтверждение; не хранит весь blob.

## 6. Ошибки и отмена

Ошибка отдельного изображения может оставить элемент в очереди/needs_review; потеря доступа к depot или auth требует остановить опасные действия. 401, permission-denied, rate limit и missing file — разные категории. Не удалять OAuth cache при каждой строке, содержащей 403. [S-DRIVE-ERRORS](SOURCES.md)

Cancel прекращает новые эффекты и сохраняет подтверждённые результаты. In-flight write может завершиться после нажатия Cancel; UI должен показать uncertain/нужна сверка, если исход неизвестен. Закрытие popup не объявляется надёжной отменой.

## 7. Приёмка

Обязательны: malformed folder input; 2+ страницы; empty folder; giant/invalid image; unread/contested barcode; verify unavailable; отсутствующие YYYY/MM в preview; совпадение имени; уже названный неверный файл; повтор после PATCH timeout; cancel; interrupted run; частичный результат; synthetic batch больше одного файла.

Live-проверка требует отдельной тестовой папки и аккаунта, разрешённых эффектов и журнала сверки. Малый размер партии не заменяет этот допуск. Cards: S01-01, S02-01…S02-03, S04-01…S04-05.

## 8. Бот и Drive — существующее разделение

`/reschedule barcodes` подключён через `src/queue/barcodeExecutor.js` в offscreen DOM. Он получает Drive token через внутренний bridge и вызывает общий scanner; depot lookup и точный reschedule выполняются в авторизованной вкладке. Не путать filing фотографий в YYYY/MM с изменением даты доставки по их номерам — это разные эффекты.

S04-03/S09-11 проверяют существующие offscreen/worker компоненты и недостающие гарантии recovery; не создавать второй runner и не отключать реализованный режим по архивному описанию. Live подтверждается явным dry_run:false. Перед Save точные targets сохраняются локально для повторения server errors в тот же день; `/reschedule retry` не сканирует Drive повторно, а вчерашнюю партию удаляет. Неподтверждённый или disputed candidate не даёт права reschedule.

## S01-04 — реалізована HTTP-межа, 2026-10-28

Drive adapter та Gmail request використовують src/shared/apiErrors.js. Explicit
readOnly: максимум 3 спроби по 15 секунд (включно response body), паузи 250/500 ms.
401 — unauthenticated, 403 — permission-denied; невідомий 403 не refresh loop.
Тимчасові помилки читання мають bounded retry, AbortSignal зупиняє очікування.
POST/PATCH — одна спроба; timeout/network/abort після dispatch, malformed success
body або 5xx дають uncertain-write. Це не rollback; перед повтором потрібна сверка.
Drive зупиняє нові ефекти після uncertain/auth/cancel, залишає partial results і
раніше успішні exact targets для ручного продовження. Нової кнопки Cancel,
автоматичного reconcile або persistent Drive journal тут немає. Gmail scopes
і доступність mutation UI не змінено. Реальні API/Chrome не перевірялися.
