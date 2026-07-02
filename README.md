# Gmail AI Assistant

> Chrome Extension · Manifest V3 · OpenAI GPT · Gmail API · Carrier Tracking

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-brightgreen)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4o-412991?logo=openai&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)
![Status](https://img.shields.io/badge/Status-In%20Development-orange)

A **Chrome Extension** that sits silently in the background, watches your Gmail inbox for customer shipping inquiries, fetches real-time delivery status from the carrier API, and automatically **generates a professional AI-drafted reply** — ready to review and send with one click.

No manual copy-pasting. No looking up tracking numbers. The assistant handles the full loop.

---

## What it does

```
New customer email arrives in Gmail
        │
        ▼
Extension extracts: tracking number · order number · customer name
        │
        ▼
Carrier API lookup → current delivery status + estimated arrival
        │
        ▼
OpenAI GPT builds a polite, accurate, context-aware reply
        │
        ▼
Reply saved as a Gmail Draft — human reviews before sending
```

The final draft is **never sent automatically**. The human stays in control; the AI handles the tedious part.

---

## Key features

- **Background polling** — Chrome alarm ticks every N minutes, checks for new unread emails, processes each one without blocking the browser
- **Structured data extraction** — regex-based parser pulls tracking numbers, order IDs, and customer info out of raw email text
- **Carrier-agnostic shipment layer** — a normalized `Shipment` schema means swapping carrier providers touches only one file
- **Prompt engineering** — `buildPrompt.js` is a pure function; tune the AI tone/style in one place without touching any network code
- **Reply validation** — AI output is checked before the draft is saved; malformed or empty replies are rejected
- **Zero hardcoded secrets** — all API keys live in `chrome.storage.local`, never in source

---

## Tech stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Manifest V3, Service Worker |
| AI | OpenAI Chat Completions API (GPT-4o / GPT-4o-mini) |
| Email | Gmail REST API (read + draft) |
| Auth | Google OAuth 2.0 via `chrome.identity` |
| Language | Vanilla JavaScript (ES2022 modules) |
| Linting | ESLint 9 |

---

## Project structure

```
gmail-ai-assistant/
├── manifest.json              Chrome Extension manifest (MV3)
├── package.json               Dev tooling only (ESLint)
└── src/
    ├── background/
    │   └── background.js      Service worker — wires Chrome alarms & events
    │
    ├── workflow/
    │   └── processEmail.js    Pipeline orchestrator — the only file that knows the full flow
    │
    ├── gmail/                 Gmail API adapter
    │   ├── watchEmails.js     Polls for new unread messages
    │   ├── readEmail.js       Fetches + decodes a single email
    │   ├── createDraft.js     Saves AI reply as a Gmail draft
    │   └── sendReply.js       Sends a draft (manual / future auto-send mode)
    │
    ├── parser/                Pure-function text extractors (no I/O)
    │   ├── extractEmailData.js     Coordinates all sub-extractors
    │   ├── extractTrackingNumber.js
    │   ├── extractOrderNumber.js
    │   └── extractCustomer.js
    │
    ├── shipment/              Carrier API adapter
    │   ├── shipmentApi.js     Low-level HTTP calls to carrier
    │   ├── getShipment.js     Public entry point with null-guard
    │   └── normalizeShipment.js   Maps raw response → internal schema
    │
    ├── ai/                    OpenAI adapter
    │   ├── openai.js          Low-level HTTP call to Chat Completions
    │   ├── buildPrompt.js     Constructs the prompt — pure function
    │   ├── generateReply.js   Orchestrates prompt → AI → validate
    │   └── validateReply.js   Sanity-checks AI output
    │
    ├── config/
    │   └── config.js          Loads keys from chrome.storage — never from source
    │
    ├── storage/
    │   ├── storage.js         Promise wrapper around chrome.storage.local
    │   └── settings.js        Typed get/set interface for user settings
    │
    ├── popup/
    │   ├── popup.html         Extension popup UI
    │   ├── popup.css          Popup styles
    │   └── popup.js           Popup controller
    │
    └── utils/
        ├── logger.js          Prefixed console logger with levels
        ├── request.js         fetch() wrapper — throws on non-2xx
        ├── delay.js           Promise sleep (rate-limit / back-off)
        └── constants.js       App-wide static constants
```

---

## Architecture decisions

| Decision | Reasoning |
|---|---|
| `processEmail.js` is the single orchestrator | One place to read, change, or debug the whole pipeline |
| Each `src/` folder owns exactly one domain | Swapping OpenAI for another model touches only `ai/`; swapping carriers touches only `shipment/` |
| `parser/` functions are pure (no I/O) | Can be unit-tested in isolation with zero mocks |
| `config.js` is the only place keys are read | Eliminates any risk of accidental hardcoded secrets |
| `request.js` wraps all `fetch()` calls | Single place to add retries, auth headers, logging |
| Drafts only — no auto-send | The human always reviews before sending; safer default |

---

## Getting started

### Prerequisites

- Chrome (or any Chromium-based browser)
- OpenAI API key
- Google Cloud project with Gmail API enabled + OAuth 2.0 Client ID

### Install

```bash
git clone https://github.com/YOUR_USERNAME/gmail-ai-assistant.git
cd gmail-ai-assistant
npm install   # installs ESLint only — no runtime dependencies
```

### Load into Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the project folder
4. The extension icon appears in the toolbar

### Set API keys

Open the extension background page DevTools console and run:

```js
chrome.storage.local.set({
  openaiApiKey:  'sk-...',
  openaiModel:   'gpt-4o-mini',   // or 'gpt-4o'
  carrierApiUrl: 'https://api.yourcarrier.com',
  carrierApiKey: 'your-carrier-key',
});
```

---

## Roadmap

- [ ] Implement `chrome.identity.getAuthToken()` OAuth flow
- [ ] Real Gmail API polling (`watchEmails.js`)
- [ ] Real carrier API integration (`shipmentApi.js`)
- [ ] Retry with exponential back-off using `delay.js`
- [ ] Email deduplication via processed-IDs set in storage
- [ ] Settings UI in `src/options/` for API key management
- [ ] Badge counter showing processed / failed email count

---

## License

MIT
