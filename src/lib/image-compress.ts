/** Long edge and JPEG quality for uploaded photos (D-083): small enough to send fast, sharp enough to read a form. */
const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.85;
/** Smaller files are already quick to send and are left untouched. */
const SKIP_BELOW_BYTES = 400 * 1024;

/**
 * Shrink a phone photo in the browser before upload. Anything that cannot be decoded here (e.g. HEIC on Chrome),
 * and any result that is not smaller, falls back to the original file, so compression can never block an upload.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml' || file.size <= SKIP_BELOW_BYTES) return file;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG has no transparency: without this, transparent PNG areas turn black.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
