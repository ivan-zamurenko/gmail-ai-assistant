---
applyTo: "bot/**,src/queue/**,src/offscreen/**,src/background/**,firestore.rules,firebase.json,test/bot/**,test/queue/**"
---
# Discord, Firestore и extension executor

Сохранять существующие bot/queue границы. Контракты: docs/discord-bot.md и docs/queue-contract.md. Изменять зеркальные bot/src/contract.js и src/queue/contract.js вместе с правилами, producer/consumer и tests. Runtime Admin credentials только в bot, никогда в extension bundle.

Проверять guild/permissions отдельно от Firestore UID, task version и sender boundary. Эфемерные ответы не анонимизируют данные. Расстояние на карте не доказательство доставки. Limit строк не доказывает корректный размер полного Discord payload.

Claim не равен exactly-once; delivery error не вызывает повтор внешней операции. Явне dry_run:false є live-підтвердженням; другого confirm_live не потрібно. После restart/timeout claimed сохранять неопределённость до сверки. Parcel/barcodes/retry реалізовані; не плутати локальні тести з підтвердженням живого виконання.

Не запускать register/start/deploy в offline tests. Два install/lockfile; зберігати чинні тести test/bot/ та test/queue/ згідно docs/TESTING.md. Нет реальных токенов/customer fixtures. OWNER-D01: ручная проверка AI-ответа, draft != send; todo done не approval письма.
