# Зовнішні інструменти та бібліотеки

Оцінка сторонніх проєктів під задачі DPD Assistance: Gmail, barcode/OCR,
AI-обробка. Для кожного — що воно робить, чи підходить нам, і мінімальний приклад.

---

## ⚠️ Головне обмеження: у нас немає збірки

Це не деталь, а **гейт для всього списку нижче**.

Зараз проєкт влаштований так:

```
package.json  →  "type": "module", devDependencies: eslint
node_modules  →  відсутній
manifest.json →  "service_worker": "src/background/background.js", "type": "module"
```

Chrome завантажує `.js` файли **напряму, як є**. Немає webpack/vite/rollup.

🎓 **Що це означає на практиці**
Коли ти пишеш `import { X } from 'some-npm-package'`, браузер намагається знайти
файл за буквальним шляхом `some-npm-package`. Такого файлу немає — це "bare module
specifier", і Chrome його не резолвить. Node.js вміє шукати в `node_modules`,
браузер — ні. Розв'язує це збирач (bundler): він заздалегідь склеює твій код разом
з кодом бібліотек в один файл, де вже немає bare-імпортів.

**Висновок:** жодну npm-бібліотеку з цього документа не можна підключити,
поки не буде додано bundler. Тому кожен пункт нижче має позначку:

| Позначка | Значення |
|---|---|
| 🟢 | Працює вже зараз, без збірки |
| 🟡 | Потрібен bundler |
| 🔴 | Не рекомендую для цього проєкту |

---

## Блок 1 — AI-агенти для розробки (не входять у продукт)

Це інструменти для нас як розробників. Вони не потрапляють у код розширення,
тому обмеження зі збіркою на них не діє.

### 1. Aider 🟢

CLI-помічник, який робить правки і **одразу комітить кожну зміну окремим
комітом**. Найкорисніше для повторюваних рефакторингів.

```bash
pip install aider-chat
cd ~/Documents/Coding/Projects/gmail-ai-assistant

# Дати йому лише ті файли, які має чіпати — так дешевше і точніше
aider src/parser/extractPhoneNumber.js src/parser/extractEmailData.js
> додай підтримку стаціонарних ірландських номерів (01, 021, 091)
```

Кожна правка = окремий git-комміт. Не подобається результат — `git revert`.

### 2. OpenHands 🟢

Автономний агент у Docker-пісочниці: сам відкриває файли, пише код, запускає тести.
Підходить для задач формату "ось issue — зроби".

```bash
docker run -it --rm --pull=always \
  -e SANDBOX_VOLUMES=$PWD:/workspace:rw \
  -p 3000:3000 \
  docker.all-hands.dev/all-hands-ai/openhands:latest
```

Далі задача в UI на `localhost:3000`, наприклад:
_"Реалізуй watchEmails() — має тягнути непрочитані листи з INBOX через Gmail API"_.

### 3. Cline 🟢

Розширення для VS Code. Сильніше за звичайний автокомпліт на багатофайлових
змінах — читає весь `src/`, будує план, потім виконує.

Встановлення: VS Code → Extensions → `saoudrizwan.claude-dev`.

### 4. Continue.dev 🟢

Open-source альтернатива Copilot з кастомними командами під наш проєкт.

```json
// .continue/config.json
{
  "customCommands": [{
    "name": "new-parser",
    "prompt": "Створи новий екстрактор у src/parser/ за зразком extractTrackingNumber.js: чиста функція, без імпортів, повертає null якщо не знайдено."
  }]
}
```

---

## Блок 2 — Gmail та парсинг листів

### 5. googleapis (Node SDK) 🔴 — НЕ підходить

Офіційний SDK, але він написаний під Node.js: використовує `http`, `stream`, `fs`.
У Service Worker цих модулів немає. Навіть з bundler'ом доведеться тягнути
поліфіли на сотні кілобайт.

Наш поточний підхід у [src/gmail/readEmail.js](../src/gmail/readEmail.js) —
прямий `fetch` до REST API — **правильніший** для розширення. Залишаємо як є.

### 6. postal-mime 🟡 — рекомендую (замість mailparser)

Уточнення до попередньої розмови: `mailparser` теж Node-only (залежить від
`stream` та `iconv`). Браузерний еквівалент — `postal-mime`.

Але спершу треба зрозуміти, **чи він нам взагалі потрібен**:

Gmail API вже віддає розібрану структуру (`payload.headers`, `payload.parts`),
і [readEmail.js](../src/gmail/readEmail.js) її обробляє. Парсер сирого MIME
потрібен лише якщо тягнути `format=raw`. Реальна користь — на складних кейсах:
переслані листи, вкладені `.eml`, поламані кодування, вкладення.

```js
import PostalMime from 'postal-mime';

const raw = await fetchGmailRaw(messageId);   // format=raw, base64url
const email = await PostalMime.parse(raw);

email.subject;                    // 'Where is my parcel?'
email.from.address;               // 'customer@example.com'
email.text;                       // чистий текст без HTML
email.attachments[0].content;     // ArrayBuffer — сюди піде barcode-декодер
```

**Ключове:** саме `attachments` роблять його цінним — це шлях до PDF/PNG
етикеток прямо з листа.

### 7. LangChain.js 🔴 — НЕ підходить

Дає structured output і retry-логіку, але важить кілька мегабайт і тягне
десятки залежностей. Для нашої задачі (один промпт → одна відповідь) це
надлишок у десятки разів.

Той самий результат дає нативний Gemini API — **без жодної залежності**:

```js
// Розширення src/ai/gemini.js — Gemini сам гарантує форму відповіді
body: JSON.stringify({
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        reply:      { type: 'STRING' },
        confidence: { type: 'NUMBER' },
        needsHuman: { type: 'BOOLEAN' }
      },
      required: ['reply', 'needsHuman']
    }
  }
})
```

🎓 `responseSchema` змушує модель повернути валідний JSON заданої форми.
Це прибирає найчастіший баг AI-інтеграцій — коли модель відповідає текстом
вигляду "Ось ваш JSON: ```json{...}```", і `JSON.parse` падає.

Це варто додати в наш код незалежно від решти рішень.

---

## Блок 3 — Штрих-коди та OCR

Зараз розпізнавання етикеток працює через Gemini Vision
([driveScanner.js](../src/depot/driveScanner.js)). Це працює, але має три ціни:
мережевий запит на кожне фото, ліміт 1500 запитів/добу, і модель іноді
"додумує" цифри, яких на фото немає.

Декодер штрих-коду таких проблем не має: він або зчитав код, або ні.

### 8. @zxing/library 🟡 — головна рекомендація

Порт ZXing від Google. Читає Code128 і DataMatrix — саме ці формати на
етикетках DPD.

```js
import { BrowserMultiFormatReader } from '@zxing/browser';

const reader = new BrowserMultiFormatReader();

async function readBarcode(imageDataUrl) {
  try {
    const result = await reader.decodeFromImageUrl(imageDataUrl);
    return result.getText();          // '051129987189428'
  } catch {
    return null;                      // код не знайдено — йдемо у fallback
  }
}
```

Найважливіше: результат далі йде в **уже існуючу** функцію
[parseBarcode()](../src/depot/labelBarcode.js) — вона розбирає штрих-кодовий
вміст (PDF417 / Code128). Тобто інтеграція чіпає лише крок отримання
рядка, а логіка розбору не змінюється.

### 9. QuaggaJS 🔴 — НЕ потрібен

Пропонувався як fallback, але після перевірки: проєкт без релізів з 2017 року,
вміє тільки 1D-коди (DataMatrix з етикеток DPD не читає) і на статичних
зображеннях програє ZXing. Форк `@ericblade/quagga2` живий, але дублює
можливості ZXing.

Правильний fallback до ZXing — не другий декодер, а **Gemini Vision, який у нас
уже працює**.

### 10. Tesseract.js 🟡 — умовно, лише якщо буде потреба

OCR у браузері. Може читати текст під штрих-кодом, коли сам код пошкоджений.

```js
import { createWorker } from 'tesseract.js';

const worker = await createWorker('eng');
const { data } = await worker.recognize(imageDataUrl);
await worker.terminate();
```

Чесна оцінка: важить ~2 МБ + мовні дані, і на фото з телефона під кутом
показує гірший результат, ніж Gemini Vision. Оскільки Gemini у нас уже
підключений і робить те саме краще — **сенс з'явиться лише тоді, коли треба
буде працювати офлайн або впертись у денний ліміт API**.

---

## Підсумок: що я справді рекомендую

| # | Інструмент | Вердикт | Причина |
|---|---|---|---|
| 1 | Aider | ✅ Ставити | Git-коміт на кожну зміну = безпечно відкотити |
| 2 | OpenHands | ⏸ Пізніше | Корисно, але спершу закрити Gmail-флоу |
| 3 | Cline | ✅ Ставити | Найкраще для багатофайлових правок |
| 4 | Continue.dev | ⏸ Опційно | Дублює Cline |
| 5 | googleapis | ❌ Ні | Node-only, наш fetch кращий |
| 6 | postal-mime | ⚠️ Якщо треба вкладення | Тільки разом з bundler |
| 7 | LangChain.js | ❌ Ні | Замінюється `responseSchema` безкоштовно |
| 8 | @zxing/library | ✅ Так | Точність замість "здогадок" AI |
| 9 | QuaggaJS | ❌ Ні | Мертвий, дублює ZXing |
| 10 | Tesseract.js | ⏸ Пізніше | Gemini робить те саме краще |

**Порядок дій, якщо йдемо цим шляхом:**

1. Додати bundler (esbuild — один файл конфігу, без магії)
2. Підключити `@zxing/library`, залишити Gemini Vision як fallback
3. Додати `responseSchema` у `gemini.js` — покращення без залежностей
4. `postal-mime` — тільки коли реально знадобляться вкладення з листів

Кроки 1–2 варто робити разом: bundler без конкретної потреби — це складність
заради складності.

---

## Рішення за підсумками обговорення

Узгоджено: пріоритет — Gmail auto-reply; етикетки приходять **вкладеннями в
листах**; обсяг **300–500 листів/день**; на першому етапі — **тільки чернетки**;
збирач — **esbuild** (додано).

### Формати штрих-кодів — визначено по реальній етикетці

Розбір `labels_example/label_example.png` показав два коди:

| Код | Тип | Вміст |
|---|---|---|
| Довгий 1D зверху | **Code128** | `%93K A9P0 5112 9987 1894 2328 372N` — маршрутизація |
| Квадрат знизу зліва | **DataMatrix** | дублює дані посилки |

QR-коду на етикетці немає. Consignment `05112998718942` вже коректно
обробляється наявним [labelBarcode.js](../src/depot/labelBarcode.js).

Етикетка на фото **перевернута на 180°** і зім'ята. DataMatrix стійкий до
повороту за побудовою, Code128 декодери пробують обидва напрямки — тож ZXing
з цим впорається.

### Два обмеження, які виявились уже після вибору бібліотек

**1. У service worker немає DOM.**
Приклад з `BrowserMultiFormatReader` вище працює лише там, де є `document`.
У MV3 background-контексті немає ні `document`, ні `Image`, ні `canvas` —
код впаде. Рішення — [Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen):
прихована сторінка з повноцінним DOM, куди service worker шле зображення.
Потребує дозволу `offscreen` у маніфесті.

**2. ZXing не читає PDF.**
Він працює з пікселями, а PDF — це векторні інструкції. Оскільки етикетки
приходять вкладеннями, серед них будуть PDF. Потрібен проміжний крок:
`pdf.js` рендерить сторінку в canvas → далі canvas іде в ZXing.

Через це послідовність для вкладення виглядає так:

```
вкладення з листа
   ├─ PDF?  → pdf.js рендерить у canvas
   └─ PNG/JPG? → одразу в canvas
        ↓
   ZXing: Code128 + DataMatrix   ← швидко, без мережі, без "здогадок"
        ↓ не зчиталось
   Gemini Vision                 ← наявний fallback, уже працює
        ↓
   parseBarcode()                ← без змін
```

Gemini лишається другим кроком, а не першим: декодер або зчитав код точно,
або чесно повернув null. Модель же може впевнено повернути неправильну цифру.

### Ліміти, які визначили дизайн Gmail-флоу

| Ліміт | Значення | Наслідок для коду |
|---|---|---|
| Service worker MV3 | вмирає після ~30 с простою | Батч по 5 листів за тик, решта — наступного разу |
| Gemini free tier | 1500 запитів/добу | 500 листів вкладаються, але запас невеликий |
| Gmail `is:unread` | це не черга | Потрібен власний облік оброблених ID |

Останній пункт — найкритичніший. Gmail-пошук повертає лист доти, доки його
не відкрили, тому без обліку та сама відповідь створювалась би на кожному
тику. Це вирішує [processedStore.js](../src/storage/processedStore.js).

