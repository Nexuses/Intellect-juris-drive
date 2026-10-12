export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** The MIME type stored for an upload; the browser must send the same one to S3. */
export function uploadContentType(type: unknown) {
  return typeof type === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : "application/octet-stream";
}
