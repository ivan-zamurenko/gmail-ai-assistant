# Testing strategy

Цей документ пояснює, які ризики перевіряють тести DPD Assistance, де вони
зберігаються та як додавати нові сценарії. Це жива карта покриття, а не копія
тестового коду.

Поточна базова лінія: **9 автоматизованих тестів у 5 файлах**. Усі вони працюють
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
│   └── labelBarcode.test.js DPD barcode domain parsing
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

### `test/depot/labelBarcode.test.js`

**Code128 keeps the parcel digit separate from the consignment number**

- Перевіряє поділ 9-значного consignment і номера фізичної посилки.
- Захищає multi-parcel consignments: parcel `2` не стає частиною tracking number.
- Використовує синтетичний Code128 payload із підтвердженою структурою.
- Не перевіряє зчитування пікселів камерою або checksum самого barcode.

**Code128 requires the confirmed 28-character DPD layout**

- Перевіряє рядки на один символ коротші й довші за підтверджені 28 символів.
- Очікує `null`, щоб parser не приймав лише валідний префікс довшого payload.
- Межа підтверджена всіма 53 Code128 records у приватному label-аудиті.
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

## Private label audit — 2026-08-29

Read-only batch перевірив **69 локальних фото** тим самим browser ZXing-шляхом,
який використовує extension. 68 доданих приватних фото ігноруються Git; один
старий `label_example.png` уже відстежувався до аудиту й залишається окремим
відомим privacy-debt. Назви файлів у batch-звіті, barcode payloads, tracking
numbers і customer PII не виводилися та не додавалися до Git.

- 69 фото оброблено без processing errors;
- 66 дали parseable consignment, 3 залишилися unreadable;
- знайдено 58 унікальних consignments; contested image — 0;
- усі 53 Code128 records мали рівно 28 символів і успішно парсилися;
- серед PDF417 decode-кандидатів: 58 parsed і 15 rejected;
- виявлено 10 routing contradictions, які тепер fail-closed повертають `null`;
- виявлено 7 PDF417 без розпізнаного routing, тому fallback `parcel: 1` не
  видаляємо без окремої звірки з альтернативним barcode на тих самих фото;
- audit виявив, що ZXing adapter фактично скидає `POSSIBLE_FORMATS` hints через
  виклик `decode()` замість `decodeWithState()`; це окрема наступна задача.

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
