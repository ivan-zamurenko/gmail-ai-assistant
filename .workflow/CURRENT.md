# DPD Assistance — налаштування комплекту v1.2

## Остання передача роботи

Читайте [спільний журнал](WORKLOG.md). Останнє доручення — S00-02 (відтворювана
збірка): виконано, [evidence](evidence/S00-02.json). Driver report обговорено,
код не змінено. Додано [S09-13](../roadmap/tasks/S09-13.md) зі статусом todo;
цей запис стосується лише планування report; активна задача — у state.json.
14 незакомічених файлів власника не чіпалися — звірити `git status`.

## Поточний стан

- Дата: 2026-10-23, Europe/Dublin.
- S00-01: виконано; workflow налаштовано й локально перевірено.
- S00-02: виконано; watch збирає console helpers, dist прив'язано до проєкту,
  чиста установка з обох lockfile перевірена; `.node-version` = 20.14.0.
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

Рекомендована картка — S00-03 (незалежний fixture test harness); виконується
окремим дорученням. Версію root package не підвищено: `package.json` містить
незакомічений bump власника. G_GIT погоджено в межах codex; інші gates не дають
дозволу на production. Не повторювати вже погоджені питання.

## Межі

Не запускалися live операції, bot/register/deploy, email send або AI uploads.
IDE config examples не активовано; фактичне discovery skill у новій сесії
не перевірено. Продуктові версії та залежності не змінено.
