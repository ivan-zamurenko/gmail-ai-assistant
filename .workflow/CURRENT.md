# DPD Assistance — налаштування комплекту v1.2

## Передача агентам — 2026-10-25

Пріоритет власника: **report S09-13 та його залежності**.
Категорії, порядок і стартовий промпт: [AGENT_ASSIGNMENTS](../docs/AGENT_ASSIGNMENTS.md).
Завершене доручення Codex/integrator: документація координації; base `dd4d7d8`;
дозволені лише інструкції, roadmap S09-01, журнал, manifest документації та reader.
Продуктова задача не активована; `active_task` лишається null.
Review завершено; продуктових writer немає. Після завершення цієї сесії наступний
integrator може оформити доручення S09-01, звіривши фактичний Git.

| Сесія | Область доручення | Режим / результат |
|---|---|---|
| Codex / integrator | Документація й інтеграція висновків | Документація готова; validators і 38 tooling-тестів PASS |
| ownership_review | Категорії всіх 54 задач і перетини файлів | Read-only завершено; 5 ролей, без дублювання |
| handoff_review | Підключення нового агента, стан і передача | Read-only завершено; один writer, явний handoff |
| discord_plan_review | S09/report, залежності та діагностика | Read-only завершено; виявлено застарілі вимоги S09-01 |

Наступний кандидат: `discord_owner`, S09-01, після конкретного доручення й запису
виконавця/шляхів. Ці три reviewer-сесії не є постійними службами і не займають
продуктові задачі. Для нового writer спочатку повторно перевірити Git.


## Остання передача роботи

Читайте [спільний журнал](WORKLOG.md). Останні доручення — S00-02 (збірка), S00-03 (test harness) і S00-04 (CI):
виконано, [S00-02](evidence/S00-02.json), [S00-03](evidence/S00-03.json), [S00-04](evidence/S00-04.json). Driver report обговорено,
код не змінено. Додано [S09-13](../roadmap/tasks/S09-13.md) зі статусом todo;
цей запис стосується лише планування report; активна задача — у state.json.
Незакомічених змін власника більше немає: бот і POD закомічено за його рішенням (`0d3fefc`, `50c1c3c`).

## Поточний стан

- Дата: 2026-10-23, Europe/Dublin.
- S00-01: виконано; workflow налаштовано й локально перевірено.
- S00-02: виконано; watch збирає console helpers, dist прив'язано до проєкту,
  чиста установка з обох lockfile перевірена; `.node-version` = 20.14.0.
- S00-03: виконано; `npm test` блокує мережу, явний набір тест-файлів,
  per-test fakes fetch/chrome, synthetic fixtures; 129 тестів. Root 1.1.10.
- S00-04: виконано; `node tools/checks.mjs [--install]` — єдиний gate; GitHub
  Actions `checks` (read-only, без secrets) — перший run success. Не required check.
- S01-01: виконано; Drive-адаптер винесено в `driveLabels.js`, тест кожного
  запиту: dry-run лише GET до Drive. Extension 6.3.0.57, root 1.1.11.
- S01-02: виконано; depot-код лише на `http://*.interlink.local`, перевірка і в
  сторінці, усі запити same-origin. POD перенесено з MAIN у розширення; зміни
  власника (бот, POD) закомічено. Extension 6.3.0.59, root 1.1.13, bot 0.2.3.
- Обсяг власника: налаштувати проєкт; нові функції — окремо.
- Гілка: `codex`; початковий HEAD `f1bead1cddfc07a8b68e0d15833cfcdd1dfc0e05`.
- Чужі незакомічені зміни збережено; перелік і розбіжності архіву:
  [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md).

## Що встановлено

AGENTS/README об'єднані; додано Copilot instructions, project skill, 54 картки
roadmap, state/evidence, offline validators і довідник START_HERE.html.
Поточні owner decisions мають пріоритет: українська, codex, dry_run:false,
реалізовані parcel/barcodes/retry. Історичні аудити не є поточним PASS.

## Перевірки та Git

Точні команди, результати та неперевірені межі:
[evidence S00-01](evidence/S00-01.json). Пройшли 111 тестів (73 product + 38 tooling), lint, build та validators.
Налаштування збережено commit `2788138` і відправлено в `origin/codex`.
Наведені 111 тестів — результат встановлення комплекту, не новий прогін журналу.

## Наступний крок

S00-05 частково: read-only запит пройдено, бракує списку інструкцій з Customizations/References — blocked до відповіді власника; S01 не блокує.
За рішенням 2026-10-25 кілька агентів виконують незалежний read-only аналіз/review;
у спільній папці один writer, спільні файли веде integrator. Передача — за
[AGENT_ASSIGNMENTS](../docs/AGENT_ASSIGNMENTS.md). Пріоритет: report і залежності;
першою рекомендовано S09-01, а не автоматичний вибір selector.
Власник дозволив підвищувати версії й робити commit + push у codex. G_GIT погоджено в межах codex; інші gates не дають
дозволу на production. Не повторювати вже погоджені питання.

## Межі

Не запускалися live операції, bot/register/deploy, email send або AI uploads.
IDE config examples не активовано; фактичне discovery skill у новій сесії
не перевірено. Встановлення комплекту не змінювало продуктові версії; подальші зміни
версій наведені вище та в evidence відповідних задач.
