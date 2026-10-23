# DPD Assistance — налаштування комплекту v1.2

## Остання передача роботи

Читайте [спільний журнал](WORKLOG.md). Останні доручення — S00-02 (збірка), S00-03 (test harness) і S00-04 (CI):
виконано, [S00-02](evidence/S00-02.json), [S00-03](evidence/S00-03.json), [S00-04](evidence/S00-04.json). Driver report обговорено,
код не змінено. Додано [S09-13](../roadmap/tasks/S09-13.md) зі статусом todo;
цей запис стосується лише планування report; активна задача — у state.json.
12 незакомічених файлів власника не чіпалися (package.json/lock закомічені з bump) — звірити `git status`.

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
Copilot і Codex працюють по черзі (рішення власника), спільні файли пише активний агент.
Власник дозволив підвищувати версії й робити commit + push у codex. G_GIT погоджено в межах codex; інші gates не дають
дозволу на production. Не повторювати вже погоджені питання.

## Межі

Не запускалися live операції, bot/register/deploy, email send або AI uploads.
IDE config examples не активовано; фактичне discovery skill у новій сесії
не перевірено. Продуктові версії та залежності не змінено.
