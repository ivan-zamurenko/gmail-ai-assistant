# Проверка обновления v1.1 — OWNER-D01

> Історичний звіт комплекту, не поточна перевірка. Актуальний стан: [LOCAL_BASELINE](LOCAL_BASELINE.md).

> Исторический документ первого ZIP / предыдущей версии комплекта. Не описывает автоматически новый bot/queue runtime. Актуальный снимок: [GITHUB_BASELINE](GITHUB_BASELINE.md); проверки обновления: [UPDATE_V1_2](UPDATE_V1_2.md).
**9 октября 2026 года.** Обновление документации после выбора владельцем ручной проверки AI-ответов. Режим автоотправки не добавлен и не разрешён.

## Изменённый объём

В `docs/decisions.md` добавлено OWNER-D01. Согласованы Gmail/AI-контракты, вопрос Q02, G_GMAIL_POLICY, инструкции агенту и checkpoint. Добавлена S06-05 — AI proposal → review/edit → подтверждённый Gmail draft. Связаны зависимости S07-01 и S08-03; обновлены roadmap и вехи.

Комплект теперь содержит 95 управляемых Markdown-файлов, 41 product card в 9 стадиях и 205 сценариев приёмки. Все product cards по-прежнему todo; все 10 gates pending. Принят режим ручной проверки, но не все детали Gmail policy и не внешние допуски.

## Фактически выполненные проверки

| Команда из корня комплекта | Результат |
|---|---|
| `node tools/roadmap.mjs validate` | PASS: 41 карточка, 9 стадий, 10 gates; exit 0 |
| `node tools/roadmap.mjs next` | S00-01, ready; exit 0 |
| `node tools/check-docs.mjs` | PASS: 95 Markdown, ошибок нет; exit 0 |
| `node --test tools/tests/docs.test.mjs tools/tests/reader.test.mjs tools/tests/roadmap.test.mjs` | 27 tests passed, 0 failed/skipped; exit 0 |
| `node tools/build-start-here.mjs` | Offline reader построен из 95 документов; exit 0 |

[Точные команды и логи](../../checks/kit-v1.1/run-report.json). После финального текста отчёта Markdown validator и reader повторно запускаются перед упаковкой; итоговый лог хранится в том же каталоге.

Дополнительно проверено: dependencies во всех таблицах карточек совпадают с JSON graph; каждой карточке соответствуют пять acceptance criteria; UI и пилот зависят от S06-05; состояния старых product tasks не повышены; исходные baseline probes и skill сохранены побайтно. [Результаты проверки согласованности](../../checks/kit-v1.1/consistency.json).

Исходный `gmail-ai-assistant.zip` имеет прежний SHA-256: `c545e03cb651305099eb581f0a37cdbf36dad456335ecdbc9f2a9dc0de4e328a`. Его содержимое не изменялось.

## Границы результата

Это проверка документации, graph/state и tooling, **не** проверка AI-ответов, Gmail drafts или отправки писем. Новые product tests из S06-05 ещё предстоит написать и выполнить. Полный runtime в комплект не включён и не менялся.

Не выполнялись новые проверки приложения, Chrome, OAuth, обращения к Gmail/Drive/depot/AI, создание drafts, send, расходы, commit/push или установка настроек владельцу. Никакой gate не закрыт по предположению.

Исторические проверки KIT-00 описаны в [VALIDATION.md](VALIDATION.md) и не выданы за повторно выполненные. Для этого обновления product RED/GREEN не применяется: изменено продуктовое решение и документация, а не код поведения.

## Установка и продолжение

Это отдельная версия комплекта. Существующие файлы объединять по [INSTALL_RU.md](../../INSTALL_RU.md), не заменяя уже заполненные CURRENT/state шаблоном. Сохранить фактические статусы/коммиты из рабочего checkout пользователя.

Первый ready шаг в исходном состоянии комплекта остаётся S00-01. Режим ручной проверки не обсуждать повторно; уточнять только оставшиеся вопросы G_GMAIL_POLICY и других gates. Будущий auto-send требует отдельного scope, проверок и решения.
