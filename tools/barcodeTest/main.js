import { loadImage, readBarcodes } from '../../src/depot/barcode.js';
import { pickConsignment } from '../../src/depot/labelBarcode.js';
import { buildLabelName, makeUnique } from '../../src/depot/labelName.js';

window.runAll = async () => {
  const rows = [];
  const taken = new Set();
  let unknownIndex = 0;

  for (const { name, src, date } of window.LABELS) {
    const img  = await loadImage(src);
    const pick = pickConsignment(readBarcodes(img));

    if (!pick) unknownIndex += 1;
    const newName = makeUnique(buildLabelName({
      date,
      number: pick ? pick.number : undefined,
      parcel: pick ? pick.parcel : undefined,
      unknownIndex,
      originalName: name,
    }), taken);
    taken.add(newName);

    rows.push({ name, newName, pick });
  }

  return rows;
};
