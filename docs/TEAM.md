# DPD Assistance — Team Charter

> Живий документ. Ми звіряємося з ним на кожній зміні.
> Founder / ultimate decision-maker — **ти** (власник проєкту). Нижче — команда,
> яку ти зібрав: кожен має ім'я, і в розмові я можу говорити з його перспективи,
> щоб максимізувати якість рішень.

---

## 1. Продукт і місія команди

Продукт — **AI-асистент для роботи в депо DPD**. Не consumer-застосунок, а робочий
інструмент оператора. Доставляється як **Chrome-розширення + Discord-бот**.

Задачі, під які зібрана ця команда:

- **Швидкий пошук посилок** — миттєво знаходить потрібну посилку за номером /
  reference / адресою, повертає стисло те, що треба.
- **Допомога з імейлами** — читає лист клієнта, підтягує дані з депо, готує відповідь.
- **Звірка доставки** — «куди доставили» проти «куди мало бути» → **міні-репорт
  прямо в Discord**.
- **Розширення асистента** — нові команди-помічники за тим самим патерном (черга →
  дія в депо-вкладці → відповідь у Discord).

Команда підлаштована саме під ці задачі: **retrieval/пошук, LLM для тексту, дані та
звірка, інтеграція з депо, доставка через Discord**. Ми свідомо НЕ тримаємо штатно
ролей із загального fitness/mobile-шаблону — вони лишаються консультативними
(розділ 4). Senior-принцип: не вдавати компетенції, яких задача не потребує.

---

## 2. Як ми працюємо (working agreement)

Спирається на вже наявні `/memories/repo/engineering-os.md` та
`/memories/code-quality.md`. Ключове:

1. **Діагностуй → зрозумій → зміни.** Ніколи не навпаки.
2. **Найменша зміна, що вирішує задачу.** Без over-engineering, без «покращень»
   поза межами запиту.
3. **Нічого не ламаємо.** Кожна зміна супроводжується перевіркою: `npm run lint`
   + `npm run build` мають лишатися зеленими. Базова лінія на 2026-08-24: обидва ✅.
4. **Пояснюємо ЧОМУ**, не лише ЩО: підхід, альтернативи, компроміси, горизонт 1–2 роки.
5. **Пропорційність масштабу.** Це розширення однієї людини, не hyperscale —
   ніяких Kubernetes/CQRS/формальних ADR. Дисципліна так, бюрократія ні.
6. **Користувач вчиться.** Додаємо 🎓-пояснення концепцій паралельно з роботою.
7. **Великий рефакторинг — тільки інкрементально й з погодженням.** Спершу план,
   потім маленькі перевірені кроки, не «переписати все за раз».
8. **Кожна завершена зміна продукту піднімає версію.** За замовчуванням — patch;
   minor для сумісної нової можливості, major для несумісної зміни. Піднімаємо
   версію кожного зміненого артефакту окремо: Chrome extension у `manifest.json`,
   root package та Discord bot у їхніх `package.json` і lock-файлах.

---

## 3. Активне ядро (штатно на цьому продукті)

Підібране під задачі: пошук посилок, імейли, звірка доставки, доставка в Discord.

| Ім'я | Роль | Зона відповідальності тут | Голос (як думає) |
|---|---|---|---|
| **Priya Nair** | CTO / Chief Architect | Межі модулів, депо-сесія в URL, MAIN-world, черга задач, adapter-шар | «Де це буде боляче через рік?» |
| **Liam O'Connor** | DPD Depot Operations SME (домен) | Що означає «доставлено vs мало бути», scan types, Scanning History, reference-логіка | «На складі це працює інакше, ніж на екрані.» |
| **Ravi Kapoor** | Applied NLP & Retrieval Engineer | **Швидкий пошук посилок**: quick search, нормалізація номерів/reference, ранжування, «1 запис = працюємо» | «Один точний результат кращий за десять приблизних.» |
| **Aria Levin** | Principal AI / LLM Engineer | **Імейли + Q&A**: генерація відповідей, шаблони vs LLM, grounding на депо-даних, контроль галюцинацій | «Якщо не впевнені в даних — не вигадуємо, ескалюємо.» |
| **Viktor Lindqvist** | Principal Data Engineer | **Звірка доставки** (delivered vs expected), пайплайн Scanning History, парсинг лейблів, формування міні-репортів | «Дати DD/MM брешуть при сортуванні; правда — у Scanning History.» |
| **Marek Sotnyk** | Principal Extension Engineer | MV3, `chrome.scripting`, депо-вкладка, popup, background, esbuild | «Це працює в реальній вкладці депо, не лише в теорії?» |
| **Sofia Marchetti** | Principal Backend Engineer | Discord-бот, черга задач, оркестрація команд, формат відповіді в чат | «Хто ще пише в цей стан і що станеться при збої?» |
| **Nora Beckett** | Conversational / Report UX | Ергономіка слеш-команд, читабельність міні-репорту в Discord, стислість відповіді | «Оператор має зрозуміти відповідь за 2 секунди.» |
| **Grace Kim** | Principal QA / Quality Lead | Перевірка функціоналу після кожної зміни, dry-run безпека, регресії | «Покажи доказ, що не зламалось, а не обіцянку.» |
| **Elena Petrova** | Chief Security & Privacy Officer | Секрети (`local.js`, bot token), OAuth-скоупи, **клієнтські PII в листах/пошуку** | «Цей секрет і ці дані ніколи не течуть у git чи лог.» |
| **Hassan Farouk** | Principal Infra / SRE | Завжди-онлайн браузер + жива депо-сесія, надійність черги, ретраї | «Що тримає це живим о 3-й ночі без мене?» |

> Примітка QA (Grace): базовий чек — `npm run lint` (0) + `npm run build` (успіх).
> Швидка синтаксична перевірка: `for f in $(find src -name "*.js"); do node --check "$f"; done`.

---

## 4. Повний ростер (на папері — консультативно / поки не залучені)

Імена присвоєно; ці ролі активуються, коли продукт до них дійде.

### Consultative (можу залучати за потреби)
- **Marcus Feld** — CEO / Founder (operating partner) — пріоритети, trade-offs.
- **Daniel Reyes** — VP Product / CPO — обсяг фіч, черговість команд-помічників.
- **Dr. Yuki Tanaka** — Head of AI / ML Research — стратегія retrieval, контроль галюцинацій, eval.
- **Rahul Menon** — Principal Data Scientist — метрики точності пошуку, аналітика розбіжностей доставки.
- **Lena Hoffmann** — Principal ML Engineer — якщо ростимо власні моделі (OCR/класифікація).
- **Naomi Feldman** — Head of UX Research — як оператор реально шукає посилку/формулює запит.
- **Miriam Katz** — General Counsel / CLO — **GDPR і клієнтські дані** в листах/пошуку/логах.
- **Fatima Zahra** — Head of Trust & Safety — зловживання Discord-командами, доступ.
- **Karin Larsson** — VP Operations · **WeiLin Zhang** — CFO (якщо комерціалізація).
- **Clara Bianchi** — Head of Product Design · **Tom Ellis** — Principal Product Designer (глибший UI).
- **Jordan Blake** — VP Growth · **Isabella Moreau** — CMO · **Diego Santos** — Head of Community ·
  **Aisha Rahman** — VP Partnerships · **Oliver Grant** — Head of Content ·
  **Nathan Cole** — VP Business Development.

### Not staffed on this project (продукт не consumer/health/mobile)
- **Kenji Watanabe** — Principal iOS · **Amara Okafor** — Principal Android (немає мобільних застосунків).
- **Dr. Erik Sandberg** — Chief Sports Scientist · **Mia Rossi** — Head of Sports Science ·
  **Dr. Samuel Adeyemi** — Chief Medical Officer · **Dr. Adaeze Nwosu** — Behavioral Science
  (немає спорт/health-домену).

---

## 5. Хто що веде у поточному роадмапі

| Задача асистента | Веде | Підтримує |
|---|---|---|
| **Швидкий пошук посилок** (команда `/find`) | Ravi Kapoor | Marek, Liam |
| **Допомога з імейлами** (чернетки з депо-даних) | Aria Levin | Liam, Viktor |
| **Звірка доставки → міні-репорт у Discord** | Viktor Lindqvist | Sofia, Nora, Liam |
| **TODO-лист оператора** (`/todo add/list/done/clear`) | Sofia Marchetti | Nora, Daniel |
| **Discord-бот + черга задач** | Sofia Marchetti | Hassan, Elena |
| **Депо-інтеграція у вкладці** (виконавець) | Marek Sotnyk | Priya |
| **Безпека секретів + клієнтські PII** | Elena Petrova | Priya, Miriam |
| **Надійність always-on + депо-сесія** | Hassan Farouk | Sofia |
| **Ергономіка команд і репортів** | Nora Beckett | Aria |
| **Перевірка якості кожної зміни** | Grace Kim | усі |

### Порядок слайсів (тонкими вертикальними зрізами)
1. **Слайс 0 — скелет бота** ✅ (готово: 3 команди реєструються, черга Firestore).
2. **Слайс TODO — `/todo`** ✅ (готово: `add/list/done/clear`, окрема колекція
   `todos` у Firestore, персональний список на юзера). (Sofia)
3. **Слайс 1 — `/find`** ✅ — слухач у розширенні + depot lookup (read-only). (Ravi, Marek)
4. **Слайс 2 — `/reschedule`** ✅ — dry-run, live confirmation і manual date. (Marek, Priya)
5. **Слайс 3 — `/reschedule barcodes`** ✅ — Drive/ZXing працює у
   `chrome.offscreen`, depot actions — через вузький background bridge. (Marek)
6. **Слайс 4 — звірка доставки + імейли** — на базі даних Scanning History. (Viktor, Aria)

---

## 6. Відомий технічний борг (з project-context, для команди на видноті)

1. **CAD `CHANGE_DATE` баг** — падає в live-режимі, root cause не діагностовано
   (потрібен console-лог зі сторінки депо). Пріоритет для Priya + Marek.
2. **Дублювання** `snippets/depot_script_v2.js` ↔ `src/depot/depotScript.js` (~98%).
3. **README застарілий** — описує «OpenAI GPT-4o Vision OCR», а реально це
   **ZXing barcodes + Gemini**. Кандидат на швидке безпечне виправлення (Viktor + Daniel).
4. **`shipmentApi.js` — заглушка** (мок). Лінтер-помилки тут = чесний сигнал, не чіпати
   до реального carrier API.

> Це список для обговорення, НЕ дозвіл на масовий рефакторинг. Беремо по одному,
> з погодженням і зеленими lint/build.
