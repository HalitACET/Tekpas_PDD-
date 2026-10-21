import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** The long edge of a page at most (mobile/CLAUDE.md): a certificate stays readable, ten pages stay under 10 MB. */
export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.7;

export interface PreparedPage {
  uri: string;
  width: number;
  height: number;
}

/**
 * A photographed page made ready to upload: scaled down so that its long edge is at most 2000 px (never up) and saved
 * as JPEG. The server draws it again and drops its metadata; this keeps the upload small on a weak connection.
 */
export async function preparePage(uri: string): Promise<PreparedPage> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const long = Math.max(original.width, original.height);
  if (long > MAX_EDGE) {
    context.resize(original.width >= original.height ? { width: MAX_EDGE } : { height: MAX_EDGE });
  }
  const rendered = long > MAX_EDGE ? await context.renderAsync() : original;
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
