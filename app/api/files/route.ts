import { getCurrentUser } from "@/app/lib/dal";
import { addFile } from "@/app/lib/drive";
import { deleteFiles, saveFile } from "@/app/lib/storage";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in." }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  const parentField = formData.get("parentId");
  const parentId = typeof parentField === "string" && parentField ? parentField : null;

  if (!(file instanceof File)) {
    return Response.json({ error: "No file was provided." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "Files must be 100 MB or smaller." }, { status: 413 });
  }

  const saved = await saveFile(file, user.id);
  const result = await addFile(user.id, parentId, {
    name: file.name,
    mimeType: file.type,
    size: file.size,
    s3Url: saved.url,
  });

  if ("error" in result) {
    await deleteFiles([saved.key]);
    return Response.json({ error: result.error }, { status: 400 });
  }

  return Response.json({ item: result.item }, { status: 201 });
}
