---
applyTo: "src/depot/**/*.js,src/popup/depotFlow.js"
description: "Depot injection, Drive label filing and local barcode safety."
---
# Depot и Drive

Прочитать контракт текущей карточки: `docs/depot-contract.md` или `docs/drive-contract.md`.

Проверять serialized `func` отдельно от обычного module import. В MAIN не передавать Google/API credentials. Проверять target/origin перед чтением и записью.

Preview не создаёт folders/logCall/reschedule и не меняет metadata. Історичний Drive probe призначений для архівного snapshot; поточну dry-run безпеку перевіряють test/depot/monthFolders.test.js та test/depot/labelBatch.test.js. POST поиска depot оценивать по назначению endpoint, не путать с mutating POST.

Contested barcode и существование номера в depot не дают гарантии принадлежности фото. Не менять правила delivered/OFD/calendar без gate. Не сохранять raw HTML и session URLs в evidence.
