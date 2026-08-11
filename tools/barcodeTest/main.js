import { loadImage, readBarcodes } from '../../src/depot/barcode.js';
import { pickConsignment } from '../../src/depot/labelBarcode.js';

window.runAll = async () => {
  const rows = [];

  for (const { name, src } of window.LABELS) {
    const started = performance.now();
    const img   = await loadImage(src);
    const codes = readBarcodes(img);

    rows.push({
      name,
      ms: Math.round(performance.now() - started),
      texts: codes.map((c) => `${c.format} x${c.reads} ${c.text.slice(0, 60)}`),
      pick: pickConsignment(codes),
    });
  }

  return rows;
};
