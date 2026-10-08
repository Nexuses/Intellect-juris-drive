import { getCurrentUser } from "@/app/lib/dal";
import { getFile } from "@/app/lib/drive";
import { keyFromLink, readFile } from "@/app/lib/storage";

// Only these types are rendered in the browser; everything else is downloaded so
// uploaded HTML/SVG can never run as a page on this site.
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/|audio\/|text\/plain)/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  const { id } = await params;
  const file = await getFile(user.id, id);
  const storageKey = file?.s3Url ? keyFromLink(file.s3Url) : file?.storageKey;
  if (!file || !storageKey) return new Response("File not found.", { status: 404 });

  const mimeType = file.mimeType || "application/octet-stream";
  const wantsDownload = new URL(request.url).searchParams.has("download");
  const inline = !wantsDownload && INLINE_TYPES.test(mimeType);
  const encodedName = encodeURIComponent(file.name);

  const headers = new Headers({
    "Content-Type": inline ? mimeType : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=0, must-revalidate",
  });
  if (typeof file.size === "number") headers.set("Content-Length", String(file.size));

  return new Response(await readFile(storageKey), { headers });
}
