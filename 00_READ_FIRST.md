# DPD Assistance — робочий комплект v1.2

Комплект встановлено в чинний `gmail-ai-assistant`, гілка `codex`.
Мета цього налаштування — узгоджені інструкції, документація, roadmap і локальні
перевірки. Нові функції виконуються окремими погодженими задачами.

## З чого почати

1. [AGENTS.md](AGENTS.md) — чинні правила проєкту.
2. [CURRENT](.workflow/CURRENT.md) — стан роботи та наступний крок.
3. [LOCAL_BASELINE](docs/audit/LOCAL_BASELINE.md) — розбіжності архіву і коду.
4. [Рішення](docs/decisions.md), [індекс](docs/INDEX.md) і [roadmap](roadmap/ROADMAP.md).

```sh
node tools/roadmap.mjs validate
node tools/check-docs.mjs
node --test tools/tests/*.test.mjs
node tools/roadmap.mjs next
```

`next` лише пропонує задачу, не запускає її. Після змін документації оновіть
офлайн-довідник: `node tools/build-start-here.mjs`, потім відкрийте `START_HERE.html`.
Продуктові перевірки описано в [TESTING](docs/TESTING.md).

## Що збережено

Chrome MV3, окремий Discord-бот, Firestore, esbuild, поточний README і власні
незакомічені зміни. `/reschedule all`, `parcel`, `barcodes`, `retry` вже мають
реалізацію. Явне `dry_run:false` є live-підтвердженням; `confirm_live` не потрібне.
Gmail-відповіді потребують перевірки людиною; налаштування не запускає надсилання.

Архівні аудити і логи збережені як історія, а не сьогоднішні докази.
54 картки roadmap — план розвитку та перевірок; їх статус ведеться окремо від
наявності функцій у коді. Налаштування IDE у `agent-config/` — приклади,
вони не змінюють глобальні налаштування автоматично. Інструкції Codex/Copilot
встановлено на рівні репозиторію; фактичне виявлення skill перевіряється в новій сесії.

Походження комплекту: [INSTALL_RU](INSTALL_RU.md),
[архівний аудит](docs/audit/UPDATE_V1_2.md). Старі російськомовні назви файлів
збережені для сумісності посилань; спілкування з власником — українською.
