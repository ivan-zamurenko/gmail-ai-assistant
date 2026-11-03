# Актуальный baseline: GitHub ZIP с существующим Discord-ботом

> Історичний звіт комплекту, не поточна перевірка. Актуальний стан: [LOCAL_BASELINE](LOCAL_BASELINE.md).

**Дата: 9 октября 2026 года. Источник: `gmail-ai-assistant-main.zip`.** Это последний предоставленный владельцем снимок, а не независимо проверенный latest GitHub HEAD.

Содержание: происхождение; карта кода; отличие от первого ZIP; статусы функций; риски; фактические проверки; границы выводов.

## 1. Происхождение

SHA-256: `b92e58bc30740f105fc94ef20fc266eb7a6c1eaa2d9201f279bd0dca8e1e3077`. В архиве 94 записи, 72 файла; source inventory охватывает 71 файл без `labels_example/label_example.png`. Изображение накладной не просматривалось/не декодировалось и не входит в комплект. Исходный ZIP остался неизменным.

`.git/` в новом ZIP отсутствует. Нельзя присваивать ему HEAD `6684b17` из первого архива, считать main текущей проверенной веткой или утверждать актуальность remote. Коммит и рабочие изменения устанавливаются только в настоящем checkout пользователя.

[Инвентаризация и SHA файлов](github-source-inventory.json), [привязка наблюдений к путям и строкам](source-traceability.json), [контроль неизменности](../../checks/kit-v1.2/source-integrity.json).

## 2. Фактическая архитектура

| Область | Новый снимок | Ключевые источники |
|---|---|---|
| Extension | MV3 6.3.0.5, popup/background/offscreen | manifest.json, build.js |
| Bot | Node ESM, discord.js, firebase-admin, start/register scripts | bot/package.json, bot/src/index.js |
| Queue | Firestore tasks, schema 1, executorUid, claim и terminal states | оба contract.js, bot queue, offscreen |
| Worker | onInstalled/onStartup/onAlarm/onMessage, offscreen и depot warming | src/background/background.js |
| Todo | userId-scoped checklist в todos | bot/src/todo.js |
| Output | ephemeral reply, find cards/history, CAD summary, optional Maps | bot/src/index.js, render.js, geo.js |
| Access | guild/Admin admission, browser UID rules, Admin server credential | bot index/config/firebase, firestore.rules |
| Tests | Root node --test, 4 security cases, bot imports | package.json, test/security.test.js |
| Config | Раздельные static local.js imports; real files отсутствуют в ZIP | src/config/config.js, bot/config/config.js |
| Gmail/AI | Начальный label flow; полного read/review/draft и active AI transport нет | src/gmail, popup/gmailFlow, config/constants |

## 3. Что исправлено в документации относительно v1.1

Описание «нет бота», «worker только onInstalled», «npm test отсутствует» и «действующий config обязательно в chrome.storage» больше не применяется. Новый manifest использует gmail.readonly вместо прежнего gmail.modify. Два dependency roots нужны раздельно; src/storage в новом дереве отсутствует.

Это не доказывает, что все прежние риски исправлены. Старый [BASELINE](BASELINE.md) сохранён как история. Каждую старую находку сверять с новой функцией и тестом, а не переносить готовый PASS/FAIL.

## 4. Реализовано и не подключено

find и reschedule all вызывают extension executor; todo работает только в боте/Firestore. Parcel и barcodes объявлены в slash schema, но executeTask возвращает unavailable. Карточки S09-10/S09-11 условные, не доказательство готовности.

MAX_HISTORY=12, CAD detail block=25 строк; лимит строк не доказывает корректный размер всего payload. Multi-parcel и latest status есть, но history renderer использует reverse входа. Геокарта optional по config, но исключение fetch/enrichment может прервать весь render.

Нет обнаруженного Discord email review, Gmail draft из Discord, auto-send или регулярных channel reports. OWNER-D01 сохранён; оператор должен проверять AI-ответы до draft/send. [Полный контракт](../discord-bot.md).

## 5. Конкретные точки проверки и доработки

| ID | Наблюдение | Тип доказательства | Карточка |
|---|---|---|---|
| B01 | task удаляется в finishWithResult до успешного Discord editReply | Source control flow; failure recovery нужно протестировать | S09-04 |
| B02 | claimed не имеет полноценного crash recovery; expiresAt — только окно pending claim | Source; не обещание exactly-once | S09-05 |
| B03 | worker принимает execute без проверки _sender | Source; эксплуатация не проверялась | S09-05 |
| B04 | confirm_live не связан с previewId/revision; в args только dryRun | Source; общая safety policy ещё требуется | S09-09 |
| B05 | parcel rules проверяют map, но не вложенную schema/PII | Source rules; deployment не проверен | S09-03/S09-06 |
| B06 | optional Maps exception может сорвать основную карточку | Source await chain; real Maps failure не вызывался | S09-07 |
| B07 | todo done по изменяемой позиции, clear может частично упасть; размер reply не ограничен | Source; concurrency/limit cases нужны отдельно | S09-08 |
| B08 | переход к другой depot-вкладке после injection exception требует различить preflight и uncertain effect | Source; не считать exception доказательством отсутствия записи | S09-09 |
| B09 | local.js статически импортируется в extension; gitignore не исключает встроенные values | Source build/config | S01-05/S08-02 |
| B10 | Drive dryRun всё ещё создаёт 2 папки на synthetic сценарии | Повторно выполненный offline probe на новом source | S01-01 |

Наличие safeErrorMessage и guards в новом коде учтено. Нельзя повторять старое утверждение «защит нет» без их анализа. В то же время редактирование строки ошибки не доказывает безопасность всех logger/render paths.

## 6. Фактически выполненные проверки в v1.2

Среда: Node v22.16.0, npm 10.9.2, Python 3.13.5. Это среда проверки, не утверждённый deployment toolchain.

| Проверка | Итог | Предел |
|---|---|---|
| `node --check` для 49 исходных JS | 49/49 PASS | Синтаксис, не imports/build/Chrome |
| `node --test checks/github/offline-discord.test.mjs` с DPD_SOURCE_ROOT | 10 passed, 0 failed/skipped | Chrome/injection boundary подставная; depotMain не исполняется |
| `node --test test/security.test.js` в source root | exit 1, env_blocked: отсутствует discord.js | Четыре исходных cases не были выполнены из-за ошибки импорта |
| Offline Drive probe на новом source | exit 1: 2 POST вместо 0 | Реальный scanner, но сеть и image decoder подставные; defect не исправлен |
| SHA сверка неперсональной source-части | 71/71 неизменны | Не проверяет GitHub remote актуальность |

[Команды/cwd/versions](../../checks/kit-v1.2/source-checks.json), [синтаксис](../../checks/kit-v1.2/source-syntax.json), [offline bot log](../../checks/kit-v1.2/source-discord-offline.log), [security suite log](../../checks/kit-v1.2/source-security-suite.log), [Dry Run log](../../checks/kit-v1.2/source-dry-run-probe.log).

## 7. Что не выполнялось

Нет npm ci, сборки приложения, Chrome live profile, Firebase Emulator/rules deploy, bot login/register, Discord/Firebase/Maps requests, Gmail read/draft/send, depot lookup/reschedule, AI calls, Git commit/push. Реальные local.js/service accounts не читались и не создавались. Runtime код не изменён.

Тесты документации v1.2 отдельно в [UPDATE_V1_2](UPDATE_V1_2.md). Их зелёный результат не закрывает 53 product cards и не устраняет найденный Dry Run дефект.
