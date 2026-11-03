---
applyTo: "test/**,tests/**,tools/tests/**,checks/**"
description: "Synthetic fixtures, evidence and meaningful RED/GREEN checks."
---
# Проверки

Использовать synthetic/redacted fixtures без реальных customer data и credentials. Запретить случайную внешнюю сеть в test harness.

Проверять поведение и эффекты, а не строку имени функции. Нулевое число обязательных тестов не считать успехом. Ошибки fixture/setup не выдавать за RED продукта.

Сохранить negative/timeout/retry/serialization cases. Не добавлять skip и не ослаблять expectations ради GREEN. Для документации проверять ссылки, schemas и graph tasks.

В evidence записывать точный command/cwd/exit code и пределы fixture. Fake transport не подтверждает OAuth или реальный внешний результат.

Актуальний набір test/ описано у docs/TESTING.md; архівні чотири security cases були розділені між спеціалізованими тестами. Root test уже есть; bot dependencies устанавливаются отдельно. Дополнять, не удалять. Firestore rules проверять Emulator, а не строковым regex; fixtures не должны импортировать startup бота с live credentials. Для двух contract mirrors нужен тест равенства значений. Discord reply failure проверять отдельно от depot execution.
