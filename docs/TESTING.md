# Testing strategy

Цей документ пояснює, які ризики перевіряють тести DPD Assistance, де вони
зберігаються та як додавати нові сценарії. Це жива карта покриття, а не копія
тестового коду.

Поточна базова лінія: **28 автоматизованих тестів у 10 файлах**. Усі вони працюють
локально без корпоративного ПК, живої depot-сесії, Discord або Firestore.

## Принципи

1. Тестуємо ризик і поведінку, а не кожен рядок коду.
2. Один тест має доводити один зрозумілий сценарій.
3. Тест імпортує production-функцію; копіювати її реалізацію в тест заборонено.
4. Тести детерміновані: однаковий вхід завжди дає однаковий результат.
5. Для parcel-даних використовуємо лише синтетичні або анонімізовані fixtures.
6. Не вгадуємо невідомий depot-формат. Спершу підтверджуємо його, потім фіксуємо
   анонімізованим regression-тестом.
7. Небезпечні або неоднозначні дані мають завершуватися fail-closed: краще
   `null`/`error`, ніж дія над неправильною посилкою.

## Як запускати

Повний набір:

```sh
npm test
```

Одна група:

```sh
node --test test/depot/labelBarcode.test.js
```

Один сценарій за назвою:

```sh
node --test --test-name-pattern="damaged consignment" test/depot/labelBarcode.test.js
```

Повний quality gate перед комітом:

```sh
npm run lint
npm test
npm run build
git diff --check
```

## Структура

```text
test/
├── bot/
│   ├── commands.test.js     Discord command contract
│   └── render.test.js       Discord parcel-card presentation
├── depot/
│   ├── barcodeReader.test.js ZXing reader-state adapter
│   ├── depotScript.test.js   Direct label reschedule target boundary
│   ├── labelBatch.test.js    Label batch orchestration and write boundaries
│   ├── labelBarcode.test.js  DPD barcode domain parsing
│   ├── labelName.test.js     Drive label filename rules
│   └── monthFolders.test.js  Drive folder planning and dry-run safety
├── queue/
│   └── executor.test.js     Queue validation and command boundary
└── utils/
    └── errors.test.js       Safe outbound error messages
```

Тест лежить поруч із групою відповідальності production-модуля. Новий великий
модуль отримує власний test-файл; не складаємо всі сценарії в один загальний файл.

## Поточне покриття

### `test/bot/commands.test.js`

**Discord command schema includes the three expected commands**

- Перевіряє, що бот публікує команди `reschedule`, `find` і `todo`.
- Захищає від випадкового видалення або перейменування команди під час рефакторингу.
- Fixture не потрібен: тест читає справжній command schema з production-коду.
- Не перевіряє реєстрацію команд у Discord API або permissions у живому guild.

### `test/bot/render.test.js`

**The private parcel card renders full recipient details and CAD location**

- Перевіряє повну приватну parcel-картку: recipient, mobile, Eircode, address і
  scan history у форматі `Bay:32 Seq:5`.
- Захищає погоджений операторський формат від регресії та повернення старого
  запису `B32/#5`.
- Використовує повністю синтетичну людину, адресу й consignment.
- Не перевіряє реальну Discord-відповідь, ephemeral visibility або route-map API.

### `test/depot/barcodeReader.test.js`

**DPD barcode reader enables only formats confirmed by the label audit**

- Фіксує production allowlist як PDF417 + Code128.
- Не дозволяє непідтвердженому DataMatrix або загальному ZXing format-набору
  непомітно повернутися в decoder.
- Контракт ізольований від DOM і ZXing adapter, тому тест працює у звичайному Node.

**Barcode windows preserve the configured ZXing reader state**

- Перевіряє, що кожен crop/rotation проходить через `decodeWithState()` після
  одноразового `setHints()`, а `reset()` викликається після спроби.
- Захищає дозволений список PDF417/Code128 від скидання до всіх ZXing
  formats і прибирає сторонні ITF, Code39 та Micro QR candidates.
- Використовує мінімальний fake reader; DOM, canvas і приватні фото не потрібні.
- Не доводить реальну image accuracy — це перевіряє private label audit.

### `test/depot/labelBarcode.test.js`

**Code128 keeps the parcel digit separate from the consignment number**

- Перевіряє поділ 9-значного consignment і номера фізичної посилки.
- Захищає multi-parcel consignments: parcel `2` не стає частиною tracking number.
- Використовує синтетичний Code128 payload із підтвердженою структурою.
- Не перевіряє зчитування пікселів камерою або checksum самого barcode.

**Code128 requires the confirmed 28-character DPD layout**

- Перевіряє рядки на один символ коротші й довші за підтверджені 28 символів.
- Очікує `null`, щоб parser не приймав лише валідний префікс довшого payload.
- Межа підтверджена 64 DPD Code128 records у повторному приватному label-аудиті.
- Не перевіряє checksum: його перевіряє ZXing до виклику `parseBarcode()`.

**PDF417 reads a confirmed anonymized DPD record**

- Перевіряє routing, поле `[4]` і parcel number у semicolon-record.
- Fixture походить із локально декодованого реального DPD PDF417, але всі
  значення анонімізовані; з 31 поля збережено лише потрібний parser-префікс.
- Захищає підтверджений формат без збереження customer PII чи tracking data.
- Не доводить структуру всіх 31 полів і не тестує ZXing image decoding.

**PDF417 rejects a damaged consignment field**

- Перевіряє запис, де routing виглядає валідним, але canonical field `[4]` має
  лише 5 цифр замість 9.
- Очікує `null`, щоб пошкоджений barcode не запустив lookup або depot-дію над
  потенційно чужою посилкою.
- Використовує синтетичну пошкоджену версію анонімізованого fixture.
- Не визначає, чи можна відновити пошкоджений barcode іншим decoder-проходом.

**PDF417 rejects contradictory consignment numbers**

- Перевіряє PDF417, де routing і canonical field `[4]` окремо містять валідні,
  але різні 9-значні consignment numbers.
- Очікує `null`: parser не має права самостійно вибирати одну з двох посилок.
- Захищає lookup і майбутні depot-дії від неправильної цілі після часткового
  пошкодження або помилкового декодування.
- Не змінює fallback для запису, в якому routing взагалі не розпізнаний; це
  окремий сценарій, який потребує власного рішення й тесту.

**PDF417 restores the full parcel number when Code128 wraps parcel 10 to 0**

- Відтворює підтверджений приватним аудитом порядок: Code128 для parcel `10`
  спочатку дає однозначний суфікс `0`, а PDF417 потім дає повне число `10`.
- Перевіряє, що PDF417 оновлює не лише preferred format, а й physical parcel.
- Захищає Scanning History і depot lookup від показу `parcel 0` замість `10`.
- Обидва barcode payloads синтетичні; ім'я та дані реального файла не збережені.

**PDF417 without routing cannot overwrite an exact Code128 parcel**

- Відтворює PDF417 із валідним consignment, але без розпізнаного routing, поруч
  із Code128 для parcel `2` того самого consignment.
- Перевіряє обидва порядки candidates, щоб результат не залежав від першого
  успішно декодованого crop/rotation.
- PDF417 залишається preferred format, але його невідомий parcel не перекриває
  точний Code128 parcel `2`.

**PDF417 without any exact parcel source cannot select a depot lookup target**

- Перевіряє валідний PDF417 consignment без routing і без matching Code128.
- Parser зберігає номер для діагностики, але повертає `parcel: null`, а safety
  boundary не допускає candidate до depot `verify()`.
- У production такий файл іде на наявний шлях `unknown-*`, без вигаданої одиниці.
- Не змінює випадок, де matching Code128 дає точний parcel.

**Contested barcode numbers cannot select a depot lookup target**

- Створює два валідні синтетичні Code128 з різними consignments на одному фото.
- Перевіряє, що діагностичний winner має `contested: true`, але safety boundary
  не передає жоден із номерів у depot `verify()`.
- У production такий файл отримує `unknown-*`, а contested marker зберігається
  для оператора; сильніший за кількістю reads candidate не обирається мовчки.
- Не тестує Drive API move/rename; тест захищає чисте доменне рішення перед ним.

### `test/depot/labelName.test.js`

**Label filenames preserve the exact physical parcel number**

- Перевіряє узгоджений filename contract для parcel `1`, `2` і `10`.
- Parcel `1` не має зайвого суфікса, `2` стає `-p02`, а двозначний `10` не
  обрізається до `0` і стає `-p10`.
- Використовує синтетичний consignment та перевіряє нормалізацію `.JPG` → `.jpg`.
- Не звертається до Drive і не перейменовує реальний файл.

**Duplicate label photos receive the next free filename**

- Імітує вже наявні базову назву та копію `-2` для того самого parcel.
- Очікує наступну вільну назву `-3`, щоб Drive move/rename не створив колізію.
- Також перевіряє, що справді вільна назва залишається без зайвого суфікса.
- Використовує лише `Set` синтетичних назв і не звертається до Drive API.

### `test/depot/monthFolders.test.js`

**Dry-run folder planning never creates missing Drive folders**

- Імітує відсутню річну папку та записує виклики fake Drive adapter functions.
- Очікує лише read-only `find`; `createFolder` і `listNames` не викликаються.
- Повертає віртуальний шлях `YYYY/MM`, щоб preview усе одно показував майбутню
  назву без будь-якого запису в Drive.
- Не перевіряє OAuth або HTTP; тест захищає доменну оркестрацію dry-run.

**Live folder planning creates the hierarchy and resumes unknown numbering**

- Перевіряє точний порядок `find → create` для року та місяця у live mode.
- Після створення місячної папки читає її назви й знаходить найбільший
  `unknown` index, щоб наступний файл не почав нумерацію з `001`.
- Зберігає всі наявні назви у `taken`, тому наступний filename collision можна
  безпечно вирішити через `makeUnique()`.
- Використовує fake adapter callbacks; реальний Drive не змінюється.

**Month folder state is reused for every photo in the same batch month**

- Запитує дві різні дати одного місяця й очікує той самий cached state object.
- Перевіряє, що зміни `unknown` і `taken` після першого фото бачить друге фото.
- Drive `find/list` callbacks виконуються лише один раз для всього місяця;
  `createFolder` для вже наявних папок заборонений fake-функцією.
- Не перевіряє cache між окремими запусками — він навмисно живе один batch.

### `test/depot/labelBatch.test.js`

**Dry-run label batch plans a verified file without moving it**

- Проганяє одну синтетичну фотографію через повний batch flow: load, barcode
  selection, depot verification, filename planning і result reporting.
- Очікує правильний planned path із parcel `2`, але `movePhoto` має 0 викликів.
- Planned name додається у shared `taken`, тому кілька фото в одному preview
  отримають ті самі collision-safe назви, що й у live mode.
- Provider ports є fake-функціями; DOM, OAuth, Drive і depot session не потрібні.

**Depot-rejected barcode is filed under the next unknown name**

- Дає batch валідний синтетичний Code128, але fake depot verifier повертає false.
- Перевіряє, що live move отримує `unknown-008`, а не decoded consignment filename.
- Result не експонує відхилений номер (`number: null`) і зберігає шлях для
  ручного пошуку фотографії оператором.
- Реальний depot і Drive не викликаються; move та verify є контрольованими ports.

**Verified live label is moved once with its exact parcel filename**

- Проганяє matching Code128/PDF417 для synthetic parcel `10` через live batch.
- Depot verifier підтверджує consignment, після чого `movePhoto` викликається
  рівно один раз із місячною папкою та filename `-p10`.
- Result і shared `taken` отримують ту саму точну назву, яку одержав move-port.
- Не викликає реальний Drive/depot; тест перевіряє orchestration contract.

**Batch contains photo failures but stops immediately on a fatal depot failure**

- Перше синтетичне фото падає під час load, отримує власний error-result, а
  наступне фото все одно проходить повний dry-run flow.
- Окремий fatal depot error передається назовні та зупиняє batch до
  завантаження другого фото.
- Захищає від двох крайнощів: один поганий файл не валить batch, але недоступний
  depot не перетворює всі наступні фото на помилкові `unknown-*`.
- Помилки, barcode та provider ports повністю синтетичні.

### `test/depot/depotScript.test.js`

**Label dry-run uses exact verified targets without reading Pending List**

- Передає direct target із synthetic consignment та внутрішнім `consId` у
  `depotMain(mode: labels)` і очікує dry-run package без DOM.
- Node test не має `document` або depot page: будь-яка спроба відкрити Pending
  List завершила б тест помилкою.
- Дублікат того самого `consId` обробляється один раз.
- Не виконує live reschedule POST; це окремий manual E2E крок.

**CAD and label targets share the same PENDING reschedule rules**

- Запускає справжній `depotMain()` окремо в CAD і labels mode проти повністю
  synthetic depot documents та мережевих відповідей.
- Для одного статусу `PENDING` обидва режими мають однаково виконати
  `CHANGE_DATE` і повернути той самий parcel result.
- Додатково доводить різницю лише у selection: CAD читає Pending List один раз,
  labels не читає його взагалі.
- POST залишається локальним fake-port; живий depot, session та customer data не
  використовуються.

**GOODS HELD without qualifying notes never reaches reschedule**

- Подає exact label target зі статусом `GOODS HELD`, але без підтверджувальної
  depot note, потрібної чинному правилу.
- Очікує `SKIP`, нуль змінених посилок і нуль звернень до reschedule form.
- Захищає fail-safe поведінку: неоднозначну GOODS HELD посилку лишає оператору,
  а не змінює її дату автоматично.
- Усі сторінки та значення синтетичні; live depot POST не виконується.

**GOODS HELD with today qualifying note reaches reschedule once**

- Формує synthetic depot note `Del. date changed ... TO <сьогодні>` у тому самому
  локальному форматі `DD/MM/YY`, який читає production rule.
- Очікує `CHANGE_DATE`, одну змінену посилку й рівно одне відкриття reschedule
  form — позитивну половину спеціального GOODS HELD правила.
- Дата обчислюється під час тесту, тому fixture не застаріває наступного дня.
- Живий depot, customer data та справжні ідентифікатори не використовуються.

### `test/queue/executor.test.js`

**Invalid or unversioned tasks cannot reach a depot command**

- Перевіряє `null`, неправильну schema version, невідому command і невалідний
  consignment для `find`.
- Захищає межу Firestore queue: неперевірене завдання завершується `error` до
  виконання depot-команди.
- Використовує синтетичні queue tasks без Firebase і без живої вкладки.
- Не перевіряє transaction claim, expiry, Firestore rules або мережевий timeout.

### `test/utils/errors.test.js`

**Outbound errors redact URLs and sensitive query values**

- Передає однакову небезпечну помилку extension- і bot-санітайзерам.
- Перевіряє, що назва depot host, session/query values і ключ не виходять у
  Firestore, Discord або користувацьке повідомлення.
- Всі значення синтетичні; справжні URL, токени й ключі в тестах заборонені.
- Не перевіряє кожну можливу форму секрету або сторонні library stack traces.

## Private label audits — 2026-08-29 / 2026-08-31

Read-only batch перевірив **69 локальних фото** тим самим browser ZXing-шляхом,
який використовує extension. 68 доданих приватних фото ігноруються Git; один
старий `label_example.png` уже відстежувався до аудиту й залишається окремим
відомим privacy-debt. За рішенням власника повторна локальна діагностика зберегла
оригінальні назви файлів, щоб проблемний label можна було знайти; цей локальний
звіт, barcode payloads, tracking numbers і customer PII не додавалися до Git.

| Метрика | До виправлення `decode()` | Після `decodeWithState()` |
|---|---:|---:|
| Оброблено фото | 69 | 69 |
| Parseable consignment | 66 | 69 |
| Unreadable | 3 | 0 |
| Унікальні consignments | 58 | 61 |
| Processing errors | 0 | 0 |
| Contested images | 0 | 0 |
| Сторонні decoded formats | Micro QR, ITF, Code39 | немає |
| DataMatrix | 0 | 0 |

Підтверджена база після виправлення:

- decoder повернув лише PDF417 і Code128;
- 64 повні DPD Code128 records мали рівно 28 символів і успішно парсилися;
- один сторонній 12-символьний Code128 candidate відхилено exact-length parser;
- серед PDF417 candidates: 61 parsed і 16 rejected;
- 11 routing contradictions fail-closed повернули `null`;
- 2 parseable PDF417 candidates без routing походили з одного фото; matching
  Code128 на ньому підтвердив parcel `1`. Ще 5 раніше порахованих candidates
  були відхилені parser і не є fallback-випадками;
- PDF417 без routing більше не вигадує `parcel: 1`: matching Code128 заповнює
  parcel, а без точного джерела safety boundary направляє файл у `unknown-*`;
- повторний production-path audit після цієї зміни: 69 parsed, 69 допущені
  exact-parcel boundary, 0 відхилених;
- локальна діагностика встановила, що `parcel: 0` був parcel `10`: одноцифровий
  Code128 candidate з'явився раніше, а preferred PDF417 не оновлював parcel;
- regression test тепер вимагає, щоб повний PDF417 parcel `10` замінював
  однозначний Code128 суфікс `0` для того самого consignment;
- DataMatrix не підтвердився жодним із 69 фото.
- Тому DataMatrix видалено з production allowlist; повернути його можна лише з
  новим реальним label-прикладом і regression evidence.

Аудит підтверджує структури для regression-тестів, але не замінює E2E перевірку
Drive/depot workflow на корпоративному ПК.

## Рівні тестування

### Unit — працює зараз

Чисті функції, validation, parsing і rendering із контрольованими даними. Швидкі,
не потребують мережі та запускаються після кожної зміни.

### Integration — наступний рівень

Перевірятиме кілька модулів разом: queue contract, claim/state transitions,
Discord handler → queue payload, barcode selection і parcel rendering. Для
Firestore потрібен emulator або ізольований test-project, не production.

### E2E / manual — коли доступний корпоративний ПК

Потрібні для сценаріїв, які неможливо чесно відтворити локально:

- справжня MV3 service-worker/offscreen lifecycle;
- authenticated depot tab і `executeScript` у MAIN world;
- реальний lookup і Scanning History;
- Firestore → extension → depot → Discord повний цикл;
- dry-run/live confirmation та відновлення після timeout;
- ZXing на репрезентативній добірці приватних label-фото.

Реальні customer-дані не додаються до Git. Фото залишаються у gitignored
`labels_example/` або іншому приватному локальному сховищі; до тестів потрапляє
лише мінімальний анонімізований fixture.

## Як додавати новий тест

1. Назвати конкретну регресію або ризик, який тест має зупинити.
2. Обрати відповідну групу в `test/`; створити новий файл лише для нового модуля.
3. Імпортувати production-функцію.
4. Побудувати мінімальний Arrange → Act → Assert сценарій.
5. Додати коментар лише там, де без нього неочевидний формат або причина.
6. Не використовувати випадковий real-world payload без підтвердження й
   анонімізації.
7. Оновити цей документ, якщо з'явився новий ризик, рівень або межа покриття.
8. Підняти версію відповідного артефакту.
9. Запустити повний quality gate і зробити один логічний commit у `codex`.

## CI status

Зараз тести запускаються локально. Автоматичного GitHub Actions workflow ще
немає. Коли додамо CI, він має виконувати той самий quality gate без доступу до
секретів, customer-даних і production Firebase/depot середовища.
