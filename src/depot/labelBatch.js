import { safeErrorMessage } from '../utils/errors.js';
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
      // Before any download or depot read: an undated photo stays untouched.
      const date = dateOf(photo.createdTime);

      step('downloading');
      const image = await loadPhoto(photo);

      step('reading');
      const candidate = pickConsignment(await readCodes(image));
      if (candidate?.contested) {
        // Owner policy (G_DRIVE_POLICY): never verified or rescheduled; filed as
        // unknown so it leaves the inbox, and flagged for a person to check.
        const named = ALREADY_NAMED.exec(photo.name);
        if (named && !/^unknown/i.test(named[1])) {
          done({
            from: photo.name, to: null, number: null, contested: true,
            status: 'review', errorCode: 'name-mismatch',
            error: 'Existing name does not match the fresh read; left for review',
          });
          continue;
        }
        const folder = await folderFor(date);
        let name = photo.name;
        if (!named) {
          folder.unknown += 1;
          name = buildLabelName({ date, unknownIndex: folder.unknown, originalName: photo.name });
        }
        name = makeUnique(name, folder.taken);
        if (!dryRun) {
          step('filing');
          await movePhoto(photo, folder, name);
        }
        folder.taken.add(name);
        done({
          from: photo.name, to: `${folder.path}/${name}`, number: null, contested: true,
          status: 'ambiguous', errorCode: 'ambiguous-barcode',
          reason: candidate.reason, candidates: candidate.candidates, error: null,
          review: 'Several consignment numbers on the photo; filed as unknown — manual review required',
        });
        continue;
      }
      const pick = acceptExactConsignment(candidate);

      step('checking');
      const known = pick ? await verify(pick.number) : false;

      // Owner policy: a previous name is kept only if the fresh verified read agrees.
      const named = ALREADY_NAMED.exec(photo.name);
      if (named) {
        const namedNumber = /^unknown/i.test(named[1]) ? null : named[1].slice(0, 9);
        const freshNumber = known ? pick.number : null;
        if (namedNumber !== freshNumber) {
          done({
            from: photo.name, to: null, number: null, contested: false,
            status: 'review', errorCode: 'name-mismatch',
            error: 'Existing name does not match the fresh read; left for review',
          });
          continue;
        }
      }

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
      const entry = { from: photo.name, to: null, number: null, contested: false, error: safeErrorMessage(err, 'Label processing failed') };
      if (['uncertain-write', 'aborted', 'unauthenticated', 'permission-denied', 'resource-exhausted', 'unavailable', 'deadline-exceeded', 'request-rejected', 'stale-drive-item', 'name-collision'].includes(err.code)) entry.errorCode = err.code;
      done(entry);
      if (['uncertain-write', 'aborted', 'unauthenticated', 'permission-denied'].includes(err.code)) {
        // Stop effects, retain confirmed entries, and account for untouched files.
        for (const pending of photos.slice(i + 1)) results.push({
          from: pending.name, to: null, number: null, contested: false,
          error: 'Not processed: batch stopped', errorCode: 'batch-stopped',
        });
        break;
      }
    }
  }

  return results;
}
