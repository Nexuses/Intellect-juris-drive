import { getCurrentUser } from "@/app/lib/dal";
import { getFolder } from "@/app/lib/drive";
import { createUploadUrl } from "@/app/lib/storage";
import { MAX_UPLOAD_BYTES, uploadContentType } from "@/app/lib/uploads";

type UploadRequest = { name?: unknown; type?: unknown; size?: unknown; parentId?: unknown };

/** Step 1 of an upload: checks the destination and returns a signed S3 URL to PUT the file to. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as UploadRequest;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const size = typeof body.size === "number" ? body.size : -1;
  const parentId = typeof body.parentId === "string" ? body.parentId : "";

  if (!name || !Number.isInteger(size) || size < 0) {
    return Response.json({ error: "No file was provided." }, { status: 400 });
  }
  if (!parentId) {
    return Response.json(
      { error: "Files must be uploaded inside a folder. Create or open a folder first." },
      { status: 400 },
    );
  }
  if (size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Files must be 100 MB or smaller." }, { status: 413 });
  }
  if (!(await getFolder(user.id, parentId))) {
    return Response.json({ error: "The destination folder no longer exists." }, { status: 400 });
  }

  const contentType = uploadContentType(body.type);
  const { key, uploadUrl } = await createUploadUrl(user.id, contentType, size);
  return Response.json({ key, uploadUrl, contentType });
}
