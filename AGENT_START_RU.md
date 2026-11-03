# Старт роботи Codex / Copilot

Цей запит призначений для окремо погодженої задачі після налаштування.
Для знайомства без змін використовуйте [read-only prompt](prompts/READ_ONLY_RU.md).

```text
Працюй із чинним DPD Assistance: Chrome MV3, Node Discord bot, Firestore, esbuild.
Спілкуйся українською. Прочитай AGENTS.md, .workflow/CURRENT.md,
docs/audit/LOCAL_BASELINE.md та docs/decisions.md.

Перевір git status, гілку і HEAD. Збережи незакомічені зміни.
Виконай node tools/roadmap.mjs next для рекомендації; не починай нову функцію,
якщо поточне доручення обмежене налаштуванням чи аналізом.
Виконай лише призначену картку, прочитавши її контракти, код, тести й виклики.
Відтвори ризик тестом, внеси мінімальну зміну, перевір результат і регресії.
Для документації використовуй validators; не вигадуй RED заради процесу.

Архівні аудити не є поточними доказами. Parcel/barcodes/retry вже реалізовані.
Folder dry-run захищено monthFolders/labelBatch тестами. Discord live
підтверджується лише dry_run:false; confirm_live не додається.
Не використовуй production листи, фото, Drive/depot або AI upload як fixtures.
Не запускай bot/register/deploy чи email send без відповідного доручення.

Онови CURRENT/state/evidence із точними результатами та межами перевірки.
Commit/push погоджених змін у codex дозволено чинним AGENTS; чужі зміни
не включай, merge main без окремого дозволу не виконуй.
Зупинись на межі задачі. Повідом зміни, перевірки, неперевірене, Git-статус
і наступний рекомендований крок.
```
