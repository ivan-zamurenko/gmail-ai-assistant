# Toolchain v1.2 — две установки и три уровня проверок

> **Адаптація до робочого проєкту, 2026-10-23.** Поточний стан і пріоритет рішень: [LOCAL_BASELINE](audit/LOCAL_BASELINE.md). Нижче збережено план комплекту v1.2; його вихідний ZIP і старі перевірки не є поточним checkout. Майбутні задачі не запускаються автоматично. Спілкування з власником — українською.


## 1. Что зафиксировано в новом ZIP

Root `package.json` содержит `build`, `watch`, `test`, `lint`, `lint:fix`; `test` — `node --test`. Root lint охватывает src, bot, test и build.js. `bot/package.json` содержит `start` и `register`, но отдельного bot test script нет.

Root `package-lock.json`: esbuild 0.28.1, ESLint 9.39.5, ZXing 0.23.0, Firebase JS 12.18.0. `bot/package-lock.json`: discord.js 14.27.0 и firebase-admin 13.10.0. Это разрешённые lock-версии снимка, не рекомендации latest. Требования Node/npm для проекта фиксируются и проверяются S00-02; версия интерпретатора текущего аудита указана в UPDATE_V1_2, не навязывается как новый production toolchain.

## 2. Установка и существующий test suite

Команды ниже выполняются из root реального приложения, не documentation-only ZIP:

```sh
node --version
npm --version
npm ci
npm --prefix bot ci
npm run lint
node --test test/
npm test
```

`test/` містить чинний модульний набір; актуальні межі описано в docs/TESTING.md. Он импортирует commands/render из `bot/src`, которым нужен discord.js. Поэтому root install без bot install недостаточен. `npm ci` обращается в registry и может исполнять install scripts; запуск разрешается отдельно в dev-среде без production secrets.

В этом обновлении установки не выполнялись. Отсутствующий discord.js нельзя выдавать за дефект поведения. Не переиспользовать платформенные node_modules первого ZIP, не менять locks ради случайной установки, не запускать bot index.js как способ проверить syntax.

## 3. Сборка и конфигурация

`src/config/config.js` статически импортирует `src/config/local.js`, отсутствующий в public ZIP. Перед build подготовить допустимую локальную конфигурацию из example без перезаписи существующей. Synthetic build не требует реального AI key, service account или Discord token. Не импортировать server credentials в extension.

```sh
npm run build
```

`build.js` пересоздаёт dist; отдельные entry points: popup, background, offscreen. One-off і watch (з S00-02) використовують один план: обидва збирають lookupConsole/futureDateConsole у `dist/console`. Шляхи прив'язані до каталогу `build.js`, тож запуск з іншого cwd не чистить чужий `dist/`. Bot Node process не bundle-ится esbuild в расширение.

Проверка load unpacked указывает на dist. Перед передачей artifact проверить отсутствие local secrets в результате сборки; gitignore не исключает значения, которые код импортировал. Успех node --check не доказывает разрешение imports, корректность serialization или запуск Chrome.

### Перевірене середовище (S00-02, 2026-10-23)

Фактично перевірено на macOS: Node 20.14.0 (`.node-version`), npm 10.7.0,
esbuild 0.28.1, ESLint 9.39.5, discord.js 14.27.0, firebase-admin 13.10.0.
У тимчасовій копії без `node_modules` `npm ci` та `npm --prefix bot ci` пройшли
з exit 0; SHA-256 обох lockfile до і після збігаються. На цій установці
`npm run build`, `npm run lint`, `npm test` — exit 0. Конфіг для збірки —
копія `local.example.js`; приватний `local.js` не копіювався. Інші версії Node
не перевірялися. Регресії збірки: `node --test test/tooling/build.test.mjs`
(склад dist, watch для console helpers, межа очищення dist, ненульовий exit).

## 4. Запуск и регистрация бота

`npm --prefix bot start` — живое подключение Discord/Firebase. `npm --prefix bot run register` — внешнее изменение guild commands. Эти команды не входят в offline tests и не запускаются автоматически инструментами комплекта. Подробные предпосылки и допуски — [Discord runbook](discord/RUNBOOK_RU.md).

Firestore Emulator вводится S09-03 с отдельным test config и locked tooling. Наличие firebase.json с rules path не означает уже настроенный Emulator. Команда реального deployment не должна использоваться вместо локальной проверки.

## 5. Проверки документации

Из root комплекта; внешние npm dependencies не нужны:

```sh
node tools/roadmap.mjs validate
node tools/roadmap.mjs next
node tools/check-docs.mjs
node --test tools/tests/*.test.mjs
node tools/build-start-here.mjs
```

Это проверки graph/state, managed MD, сохранённых контрактов документации и reader. Они не выполняют test-команды карточек и не закрывают product acceptance. При интеграции root node --test может обнаруживать и эти тесты; отчёт должен разделять product и tooling cases.

## Історичні probes

`checks/baseline/` та `checks/github/offline-discord.probe.mjs` збережені лише
для відтворення старого source snapshot. Їхні очікування не відповідають поточним
parcel/barcodes/full-card можливостям, а Drive VM linker — нинішнім залежностям.
Вони не входять у поточний gate. Для історичного відтворення слід явно задати
`DPD_SOURCE_ROOT` на окрему копію відповідного snapshot, не на робочий checkout.
Поточні докази: `npm test`, `test/` і `tools/tests/`.

### Test harness (S00-03)

`npm test` = `node --test --import ./test/helpers/noNetwork.js` з явним набором
`test/*/*.test.js`, `test/*/*.test.mjs`, `tools/tests/*.test.mjs`. Preload
блокує будь-який не підмінений `fetch`; per-test fakes — `test/helpers/harness.js`,
synthetic fixtures — `test/fixtures/` через `test/helpers/fixtures.js`. Шаблон
без явного переліку в Node 20 запускав би helper-модулі як порожні «ok».
Якщо шаблон не знаходить файлів, shell передає його буквально і Node завершується
з помилкою — порожній набір не стає успіхом.

## 7. Будущие файлы тестов

Пути `test/bot/*.test.mjs`, `test/queue/*.test.mjs` и другие новые файлы из карточек — целевые. Их нужно создать при выполнении задачи. S00-03 расширяет harness зі збереженням поточного модульного suite. Gaps browser/Emulator/live явно записываются, не заменяются успешной Markdown validation.

## Поточні перевірки після інтеграції

Історичний `checks/github/offline-discord.probe.mjs` призначений лише для
старого snapshot і не входить у поточний gate. Те саме стосується старого
Drive VM probe: його linker не підтримує нинішній module graph.
Поточні докази — `npm test` та [docs/TESTING.md](TESTING.md). Залежності root
і bot мають окремі locks: `npm ci`, `npm --prefix bot ci`; їх не оновлюємо
під час встановлення комплекту. Для інструкцій — roadmap/doc validators,
`node --test tools/tests/*.test.mjs` та генерація offline reader.
