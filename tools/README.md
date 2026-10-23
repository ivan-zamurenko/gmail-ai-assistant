# Локальные инструменты комплекта

Эти `.mjs` используют только Node built-ins и не требуют npm install. Они не импортируют product runtime и не выполняют команды, прочитанные из Markdown. Проверенная версия среды указана в [VALIDATION](../docs/audit/VALIDATION.md).

## Read-only selector

```sh
node tools/roadmap.mjs validate
node tools/roadmap.mjs next
node tools/roadmap.mjs show S00-01
node tools/roadmap.mjs context S00-01
```

По умолчанию root определяется от расположения `tools`, не от произвольной текущей папки. Для временного fixture доступен `--root PATH`. Ошибки JSON/ID/структуры возвращают ненулевой exit code. `next` не меняет state и не запускает task commands.

Валидация проверяет уникальные ID, существующие cards, зависимости, cycles, gates, state consistency, одного in_progress writer, причины blocked и evidence для done. Approved gate требует непустую ссылку на решение; валидатор не может доказать, что решение действительно принял владелец. Содержательное review evidence остаётся обязательным.

`done` требует `outcome: passed` и хотя бы один успешный GREEN или ручной passed check в task evidence. RED с ненулевым exit code допустим как часть TDD evidence. Task ID должен совпадать. Все зависимости done, gates approved. Это структурная защита от случайной ложной отметки, а не криптографическое доказательство честности отчёта.

## Markdown validation

```sh
node tools/check-docs.mjs
```

Список управляемых этим комплектом Markdown находится в `DOCS_MANIFEST.json`. Проверяются UTF-8, непустое содержимое, заголовок, закрытие fences и существование локальных ссылок без выхода за root. Ссылки внутри code fences не трактуются как файловые пути. External URLs не запрашиваются этой командой; anchor correctness и смысл текстов не доказаны одним валидатором.

Старые документы исходного репозитория не включаются автоматически: иначе их исторические ссылки могли бы блокировать установку либо пришлось бы скрыто менять чужие файлы. Новый управляемый `.md` добавить в manifest и проверить diff. Удаление файла требует убрать/исправить все соответствующие ссылки.

## Offline HTML

```sh
node tools/build-start-here.mjs
```

Это отдельная явно изменяющая команда: обновляет только `START_HERE.html` из текущих управляемых Markdown. Просмотр не требует сети, login или скачивания зависимостей. Текст Markdown показывается полностью; sidebar поиск фильтрует документы по названию и содержимому. HTML — удобное производное, source of truth остаётся `.md`.

## Тесты самих инструментов

```sh
node --test tools/tests/*.test.mjs
```

Тесты создают одноразовые каталоги, проверяют invalid graph/state/paths/UTF-8/links и отсутствие исполнения shell commands из карточки. Они не доказывают product runtime и не включают Drive probe в общий GREEN: він характеризує історичний baseline, а не поточний checkout.

## Історичний baseline defect

```sh
node --experimental-vm-modules checks/baseline/drive-dry-run-probe.mjs --root /path/to/source-repository
```

На исходной версии ожидается exit 1: два Drive folder creation POST при dryRun=true. На исправленной версии после S01-01 ожидается exit 0. Probe подставляет fetch/decoder, но исполняет настоящий scanner; он не подключается к Google. Не менять его assertion ради зелёного общего набора.

## Обновление v1.2 — Discord и сохранение истории

Архівний source baseline — docs/audit/GITHUB_BASELINE.md; актуальний стан — docs/audit/LOCAL_BASELINE.md. Старые checks/baseline logs относятся к первому ZIP. Новый прогон того же Drive probe зафиксирован отдельно в checks/kit-v1.2/source-dry-run-probe.log: ожидается 0 mutations, получено 2 POST; runtime не менялся.

Історичний offline probe `checks/github/offline-discord.probe.mjs` импортирует leaf-модули source root без discord.js или bot startup. По умолчанию source root — корень репозитория после установки комплекта. Для отдельной source-копии передать абсолютный DPD_SOURCE_ROOT в окружении. Это инструмент воспроизведения, не установленный бот.

`tools/tests/discord-docs.test.mjs` проверяет согласованность добавленных MD/metadata: новый поток S09, source capabilities, оба locks, release edges, исторический baseline и OWNER-D01. Он не проверяет реальные права Discord/Firestore. Все продуктовые проверки и их границы указаны в docs/discord/TEST_MATRIX.md.

## Поточний checkout

Історичний Discord probe має назву `.probe.mjs`, щоб `npm test` не підхоплював застарілі очікування щодо parcel/barcodes та полів `/find`. Для відтворення використовуйте окрему копію відповідного архівного source і явний `DPD_SOURCE_ROOT`; probe не є актуальним quality gate.

Drive probe також прив’язаний до старого module graph: його linker/stubs можуть бути несумісними з новим fast reader. Помилка завантаження probe не доводить дефект dry-run. Поточні гарантії перевіряють `test/depot/monthFolders.test.js`, `test/depot/labelBatch.test.js` та інші тести, описані в [TESTING](../docs/TESTING.md).

Інструменти перевіряють структуру документації та evidence, але не підтверджують живі інтеграції. Чинні правила власника в AGENTS мають перевагу над архівними інструкціями.
