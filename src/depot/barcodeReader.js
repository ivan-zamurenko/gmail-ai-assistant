/**
 * Decodes one prepared image window without discarding the reader hints that
 * were configured once for the whole photo.
 */
export function decodeWithConfiguredReader(bitmap, reader) {
  try {
    return reader.decodeWithState(bitmap);
  } catch {
    return null;
  } finally {
    reader.reset();
  }
}
