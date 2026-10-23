# DPD Assistance — налаштування комплекту v1.2

## Поточний стан

- Дата: 2026-10-23, Europe/Dublin.
- S00-01: виконано; workflow налаштовано й локально перевірено.
- Обсяг власника: налаштувати проєкт; нові функції — окремо.
- Гілка: `codex`; початковий HEAD `f1bead1cddfc07a8b68e0d15833cfcdd1dfc0e05`.
- Чужі незакомічені зміни збережено; перелік і розбіжності архіву:
  [LOCAL_BASELINE](../docs/audit/LOCAL_BASELINE.md).

## Що встановлено

AGENTS/README об'єднані; додано Copilot instructions, project skill, 53 картки
roadmap, state/evidence, offline validators і довідник START_HERE.html.
Поточні owner decisions мають пріоритет: українська, codex, dry_run:false,
реалізовані parcel/barcodes/retry. Історичні аудити не є поточним PASS.

## Перевірки та Git

Точні команди, результати та неперевірені межі:
[evidence S00-01](evidence/S00-01.json). Пройшли 111 тестів (73 product + 38 tooling), lint, build та validators.
Підготовлено окремий commit налаштування у codex; фактичні Git-результат і SHA
буде у фінальному повідомленні та Git history, не всередині власного commit.

## Наступний крок

Після завершення S00-01 рекомендована картка — S00-02 (відтворювана збірка).
Вона не виконується в цій сесії. Решта карток зберігають todo до перевірки їхніх
acceptance. G_GIT погоджено в межах codex; інші gates стосуються майбутніх змін,
а не нового дозволу на production. Не повторювати вже погоджені питання.

## Межі

Не запускалися live операції, bot/register/deploy, email send або AI uploads.
IDE config examples не активовано; фактичне discovery skill у новій сесії
не перевірено. Продуктові версії та залежності не змінено.
