# Спільний журнал DPD Assistance

Читати перед роботою разом із [CURRENT](CURRENT.md). Тут — коротка історія;
[state.json](state.json) — статуси roadmap, [evidence](evidence/S00-01.json) — докази.
Запис про план або аналіз не означає реалізацію чи дозвіл на live-операції.

## Як вести

- Після завершеного кроку додавати внизу один рядок: дата, агент, статус,
  що зроблено, перевірка або посилання, наступний крок.
- Статуси: **виконано / перевірено / погоджено / запропоновано / заблоковано**.
- Перед змінами звірити Git і актуальні файли. Не привласнювати чужі зміни.
- За паралельної роботи журнал, CURRENT і state оновлює один інтегратор;
  інші агенти передають йому підсумки. Історичні записи не переписувати;
  виправлення додавати новим рядком. Секрети й клієнтські дані не записувати.

## Записи

Початкові записи нижче відновлено з цієї сесії та наявного evidence.
Дата — Europe/Dublin; порядок рядків відповідає порядку роботи.

| Дата | Агент | Статус | Короткий результат / перевірка | Далі |
|---|---|---|---|---|
| 2026-10-23 | Codex + reviewers | Виконано | S00-01: інтегровано комплект v1.2; commit `2788138` відправлено в `origin/codex`. 111 тестів, lint, build, validators — PASS; [evidence](evidence/S00-01.json). | S00-02 рекомендовано, не розпочато. |
| 2026-10-23 | toolchain_owner / extension_owner / discord_owner | Перевірено | Read-only аналіз трьох областей; ownership: збірка/тести, MV3/depot/Drive, Discord/Firestore. Власник обмежив роботу аналізом і розподілом задач. | Впровадження — за окремим дорученням. |
| 2026-10-23 | Codex + reviewers | Перевірено | За кодом: watch пропускає console bundles; depot form action потребує перевірки origin; queue видаляє результат до Discord delivery; у S09-01 лишилися застарілі вимоги schema 1 і unavailable modes. Не виправлено. | Узгодити картку перед її виконанням. |
| 2026-10-23 | Власник | Погоджено | Мінімум необхідних тестів: спочатку очікувана поведінка й тест, потім код. Не послаблювати тест заради GREEN; не дублювати наявне покриття. | Застосовувати до наступних змін поведінки. |
| 2026-10-23 | Власник + Codex | Погоджено | Driver report англійською, наразі в Discord. Лише дані доставки, куди їхати та куди передоставити; без історії сканів. Назва точки: Recorded delivery point. WhatsApp — поки ручне перенесення, без інтеграції. | Узгодити остаточний макет; report ще не реалізовано. |
| 2026-10-23 | Codex + extension_owner | Перевірено | GPS і POD зараз обираються незалежно; payload не зберігає їхній спільний зв'язок із parcel/event. Для driver report потрібна одна конкретна посилка та подія. Аналіз статичний, без live-запусків. | Спочатку визначити контракт даних і мінімальні regression-тести. |
| 2026-10-23 | Codex | Запропоновано | Два Maps-посилання та окрема дія Text for WhatsApp із повними URL; POD передається окремо. Остаточне оформлення і кнопка ще не погоджені як реалізація. | Не вважати пропозицію готовою функцією. |
| 2026-10-23 | Codex | Виконано | Створено цей журнал і правило його читання/оновлення в AGENTS та Copilot; додано до CURRENT й offline reader. 38 tooling-тестів і roadmap/doc validators — PASS; product/runtime не змінено. | Наступному агенту прочитати CURRENT, журнал і перевірити dirty tree. |
| 2026-10-23 | Copilot | Виконано | S00-02: `build.js` — watch збирає console helpers, шляхи від кореня проєкту; `test/tooling/build.test.mjs` RED 2/4 → GREEN 4/4; чистий `npm ci` обох locks без змін; lint/test 115/build — PASS; [evidence](evidence/S00-02.json). Chrome load не перевірявся. | S00-03 — окремим дорученням. |
| 2026-10-23 | Codex | Виконано | Додано [S09-13](../roadmap/tasks/S09-13.md): driver report англійською в Discord, без історії, точний parcel/event, POD і Maps; scope, залежності й мінімальні test-first критерії. Статус todo; roadmap/doc validators і 38 tooling-тестів PASS, runtime не змінено. | Реалізація за окремим дорученням після залежностей; відкриті UX-рішення — у картці. |
| 2026-10-23 | Copilot | Виконано | Root package 1.1.9 за S00-02 (дозвіл власника на bump + commit/push). | — |
| 2026-10-23 | Copilot | Виконано | S00-03: `npm test` з preload-забороною fetch і явним набором файлів (helper-модулі більше не рахуються як «ok»); fakes fetch/chrome, валідатор fixtures, Gmail labels і naming тести. RED 3/6 → GREEN; 129/129, lint, build — PASS; root 1.1.10; [evidence](evidence/S00-03.json). Сокети discord.js/firebase не перехоплюються. | S00-04 — звірити картку. |
| 2026-10-23 | Copilot | Виконано | S00-04: `tools/checks.mjs` (fail-fast gate: lint, test>0, build, артефакти manifest, docs, diff-check; `--install` — npm ci root+bot, lock drift) і read-only workflow `checks` з pinned actions. 8/8 тестів; локально PASS; чистий clone PASS; GitHub run 39990600863 success. Власник: агенти по черзі, CI push дозволено. | S00-05; required check — рішення власника. |
| 2026-10-23 | Copilot + власник | Заблоковано | S00-05: read-only запит у Copilot (VS Code 1.143.0) пояснив картку й заборони live, 0 змін; Customizations — без помилок. Список інструкцій/References не надано, debug-логів за сьогодні немає; [evidence](evidence/S00-05.json). | Власнику — список з Customizations → Instructions; далі S01. |
| 2026-10-23 | Copilot | Виконано | S01-01: dry-run guard уже був; закрито пробіл — Drive-адаптер (`driveLabels.js`) тестується по кожному method/URL: dry-run лише GET, depot POST дозволений, live — папки після verify і один PATCH. Мутації без `dryRun` → RED; 4/4, gate 141 — PASS; [evidence](evidence/S01-01.json). Браузерний прогін декодування не робився. | S01-02; власнику — smoke dry-run скану. |
| 2026-10-23 | Copilot + власник | Виконано | S01-02: знайдено, що POD-чернетка передавала логін/пароль DPD API у MAIN сторінки; за рішенням власника POD перенесено в розширення (`podImage.js`) і закомічено разом з його змінами бота. Далі: правило вкладки `depotTarget.js`, повторна перевірка в executor і на сторінці, same-origin для всіх fetch/form action. RED 4 сценарії → GREEN; gate 153 — PASS; [evidence](evidence/S01-02.json). | Власнику — live smoke `/find` з POD і dry-run у popup; далі S01-03. |

Шаблон нового рядка: `дата | агент | статус | результат + доказ/неперевірене | далі`.
