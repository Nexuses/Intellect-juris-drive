import { after } from "next/server";
import { getCurrentUser } from "@/app/lib/dal";
import { indexFile } from "@/app/lib/doc-index";
import { addFile } from "@/app/lib/drive";
import { deleteFiles, publicFileUrl, storedFileSize } from "@/app/lib/storage";
import { MAX_UPLOAD_BYTES, uploadContentType } from "@/app/lib/uploads";

export const maxDuration = 300;

type CompleteRequest = { key?: unknown; name?: unknown; type?: unknown; parentId?: unknown };

/** Step 2 of an upload: the browser has PUT the file to S3; record it in the drive. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as CompleteRequest;
  const key = typeof body.key === "string" ? body.key : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const parentId = typeof body.parentId === "string" ? body.parentId : "";

  if (!key.startsWith(`${user.id}/`) || key.includes("..") || !name) {
    return Response.json({ error: "No file was provided." }, { status: 400 });
  }
  if (!parentId) {
    return Response.json(
      { error: "Files must be uploaded inside a folder. Create or open a folder first." },
      { status: 400 },
    );
  }

  const size = await storedFileSize(key);
  if (size === null) {
    return Response.json({ error: "The upload didn't finish. Try again." }, { status: 400 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    await deleteFiles([key]);
    return Response.json({ error: "Files must be 100 MB or smaller." }, { status: 413 });
  }

  const result = await addFile(user.id, parentId, {
    name,
    mimeType: uploadContentType(body.type),
    size,
    s3Url: publicFileUrl(key),
  });
  if ("error" in result) {
    await deleteFiles([key]);
    return Response.json({ error: result.error }, { status: 400 });
  }

  after(() => indexFile(result.item.id));
  return Response.json({ item: result.item }, { status: 201 });
}
