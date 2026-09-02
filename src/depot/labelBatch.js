import { acceptExactConsignment, pickConsignment } from './labelBarcode.js';
import { buildLabelName, dateOf, makeUnique } from './labelName.js';

// A file named by an earlier run. Matches parcel suffixes and duplicate copies.
const ALREADY_NAMED = /^\d{4}-\d{2}-\d{2}_(\d{9}(-p\d{2})?|unknown-\d+)(-\d+)?\.[a-z0-9]+$/i;

/**
 * Processes an already-listed batch through injected image, depot and filing
 * ports. Provider details stay in driveScanner.js; safety decisions live here.
 */
export async function processLabelBatch({
  photos,
  verify,
  dryRun,
  onProgress,
  loadPhoto,
  readCodes,
  folderFor,
  movePhoto,
}) {
  const results = [];

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const step = (state, entry) => onProgress?.(i + 1, photos.length, state, entry);
    const done = (entry) => { results.push(entry); step('done', entry); };

    try {
      step('downloading');
      const image = await loadPhoto(photo);

      step('reading');
      const candidate = pickConsignment(await readCodes(image));
      const pick = acceptExactConsignment(candidate);

      step('checking');
      const known = pick ? await verify(pick.number) : false;

      const date = dateOf(photo.createdTime);
      const folder = await folderFor(date);
      let name = photo.name;

      if (!ALREADY_NAMED.test(name)) {
        if (!known) folder.unknown += 1;
        name = buildLabelName({
          date,
          number: known ? pick.number : undefined,
          parcel: pick?.parcel,
          unknownIndex: folder.unknown,
          originalName: photo.name,
        });
      }
      name = makeUnique(name, folder.taken);

      if (!dryRun) {
        step('filing');
        await movePhoto(photo, folder, name);
      }
      folder.taken.add(name);

      done({
        from: photo.name,
        to: `${folder.path}/${name}`,
        number: known ? pick.number : null,
        contested: candidate?.contested ?? false,
        error: null,
      });
    } catch (err) {
      // A depot that stopped answering would rename every remaining photo to
      // unknown, so stop and keep what is already filed.
      if (err.fatal) throw err;
      done({ from: photo.name, to: null, number: null, contested: false, error: err.message });
    }
  }

  return results;
}
