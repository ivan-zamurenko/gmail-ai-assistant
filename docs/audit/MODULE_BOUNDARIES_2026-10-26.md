# Аналіз меж модулів — 2026-10-26

> Подальша зміна POD-FALLBACK: відмова POD більше не забирає core /find;
> додано локальну заглушку. Нижче — історичний висновок на baseline bd64375.
> Maps, timeout та delivery ризики залишаються невиправленими.

Baseline: `bd64375`, branch codex, початковий Git чистий. Доручення власника:
перевірити, чи можна виправляти модулі без впливу на решту. Статичний огляд
Codex/integrator + architecture_bot_audit + architecture_extension_audit.
Runtime не змінювали, нових тестів не додавали, живі сервіси не запускали.

## Висновок

**Структура частково модульна; повної ізоляції збоїв немає.** Розділення файлів
уже допомагає локальним виправленням, але деякі модулі змішують отримання фактів,
збагачення даних, показ і підтвердження доставки відповіді. Відмова optional
компонента може знищити корисну відповідь. Це не доказ падіння всього процесу.
Масове переписування або новий framework не потрібні.

## Що вже добре відокремлено

| Межа | Доказ у коді | Що можна міняти локально |
|---|---|---|
| Запуск бота / обробник команд | [index.js](../../bot/src/index.js), рядок 18; [interactions.js](../../bot/src/interactions.js), рядок 8 | Admission без запуску client/Firebase; зовнішні порти явні |
| Побудова queue envelope / Firebase | [pendingTask.js](../../bot/src/pendingTask.js), рядок 4 | Побудову запису без SDK; wire format зберігати |
| Batch / Drive / декодер | [labelBatch.js](../../src/depot/labelBatch.js), рядки 11–20; [driveScanner.js](../../src/depot/driveScanner.js), рядок 43 | Drive adapter або decoder при незмінних вході/результаті |
| Exact target collection | [labelVerifier.js](../../src/depot/labelVerifier.js), рядок 10 | Спільне правило для popup і Discord |
| Bot / extension | [queue-contract](../queue-contract.md), mirrors у bot/src і src/queue | Незалежні компоненти за сумісного протоколу; equality test уже є |

Label batch ізолює звичайну помилку одного фото, але fatal depot error зупиняє
batch (`labelBatch.js:68–72`). Це правильна різниця між частковим збоєм і
відсутністю критичних даних, а не вимога продовжувати будь-якою ціною.

## Де межі не захищають від поширення збою

| Пріоритет | Підтверджений шлях | Наслідок / найменший напрям виправлення | Roadmap |
|---|---|---|---|
| Високий | [executor.js](../../src/queue/executor.js), 288–291: POD error повертає error після успішного lookup | Фото не отримано → основні факти не повертаються. Зберігати факти та окремий стан POD unavailable | S09-06 / S09-13 |
| Високий | [render.js](../../bot/src/render.js), 172/177/239 чекає geo; [geo.js](../../bot/src/geo.js), 27/54/111 без власного timeout/catch | Network/JSON rejection або довге очікування Maps блокує картку. Окреме bounded optional enrichment, renderer отримує готові дані | S09-07, S01-04 |
| Високий | [queue.js](../../bot/src/queue.js), 55–61 викликає removeTask до resolve; Discord reply пізніше | Збій reply може залишити без збереженого результату. Розділити operation result і delivery acknowledgement; повторювати показ, не depot дію | S09-04 |
| Високий перед live mutations | [executor.js](../../src/queue/executor.js), 91–124: після injection exception пробується наступна вкладка; helper спільний для lookup і depotMain | За невизначеного live результату можливе повторне виконання. Це ризик зі структури, не спостережений дублікат. Розділити read retry та mutation indeterminate | S03-05 / S09-09 |
| Середній | [depotFlow.js](../../src/popup/depotFlow.js), 164–222/259–318 і [barcodeExecutor.js](../../src/queue/barcodeExecutor.js), 107–139 | Два сценарії recovery/reschedule навколо спільних helpers: зміна політики може вимагати двох правок. За наступної зміни виділити спільний use-case з портами, лишити UI лише відображенням | S04-03/04, S09-11 |
| Важливий для report | [lookup.js](../../src/depot/lookup.js), 250–271 обирає latest delivered POD і latest GPS незалежно; executor 271–300 проєктує payload | Немає гарантованої спільної parcel/event identity для report. Потрібен узгоджений контракт від lookup до model/renderer; це не одна локальна косметична правка | S09-06 / S09-13 |

Maps helpers уже повертають null для деяких HTTP-відмов і відсутнього ключа.
Проблема не в кожній помилці Maps, а в неперехоплених network/parse failures
і відсутності власного обмеження очікування. `interactions.js:202–203` ловить
помилку render й показує error замість основної картки.

## Додаткові зв’язки, які слід врахувати

- `bot/src/render.js:155–168` визначає актуальні стани/кількість посилок і водночас
  формує Discord embeds та викликає Maps. Для S09-13 потрібна маленька чиста
  модель report, окрема від renderer; інакше WhatsApp успадкує Discord-залежності.
- `depotFlow.js:291` та `barcodeExecutor.js:98` обирають auth retry за текстом
  помилки. Зміна повідомлення адаптера може змінити логіку caller. У S01-04
  доцільні стабільні codes; не потрібна універсальна ієрархія exceptions.
- `offscreen.js:114–118` мовчки ігнорує повторну помилку writeResult: причина
  завислого claimed може загубитися. Додати безпечну діагностику, а не replay.
- `interactions.js:146–147` оголошує доставку DM перед user.send; це ще одна
  частина S09-04, не доказ успішної доставки.

## Діагностика та документація

Є safe-error helpers і stage progress, але немає єдиного узгодженого набору
operation/error codes на всіх межах. `interactions.js:188–195` передає в логи
частину номера та raw _diag; `index.js:17` — raw client error. Це огляд шляхів,
не підтвердження витоку реальних секретів. S01-03 має залишити корисні component,
phase, outcome/errorCode без клієнтських ідентифікаторів та raw payload.

Коментар `utils/request.js` каже «усі запити через wrapper», але geo/Drive/depot
використовують власний fetch. Це не причина силоміць об'єднати всі adapters:
вони працюють у різних runtime. Не покладатися на цей коментар як на гарантію
глобального timeout/retry. MAIN functions повинні лишатися self-contained;
звичайний import helper всередині serialized function не вирішує дублювання.

## Практичне рішення

Продовжувати report-first малими кроками: S01-03 діагностика → S01-04 API errors →
решта залежностей report з [AGENT_ASSIGNMENTS](../AGENT_ASSIGNMENTS.md).
У S09-04 виправляти result/delivery boundary; у S09-06/07/13 — facts, POD, Maps
та спільну parcel/event identity. Жодна з цих задач цим аудитом не виконана.
Ризик повтору mutation перевірити до наступного дозволеного live mutation,
не трактувати offline report роботу як дозвіл виконувати такі операції.

Локальний adapter fix за незмінного контракту зазвичай не потребує правок інших
модулів. Зміна контракту чи бізнес-правила потребує узгодження callers/consumers.
Навіть локальну правку перевіряти одним потрібним regression-сценарієм і коротким
прогоном залежного шляху, коли доступне середовище; гарантії «нуль наслідків» немає.
Не додавати тести на кожну функцію. Наявні тести не видаляти; нові — лише на
конкретний збій, втрату даних або неправильну/повторну дію.

## Межі доказів

Висновки ґрунтуються на читанні поточного коду. Не симулювали збої мережі,
Chrome restart, API outage або delivery failure; не перевіряли live Discord,
Firebase, Maps чи depot. Попередні 162 PASS — історичний gate S09-02, не новий
результат цього аудиту. Перевірки цієї зміни стосуються лише документації.
