"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/app/lib/dal";
import { deleteAllForOwner } from "@/app/lib/drive";
import { createUser, deleteRegularUser, updateUser } from "@/app/lib/users";
import { readField, readUserFields, type FormState } from "@/app/lib/validation";

async function isAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin";
}

function refreshUserPages() {
  revalidatePath("/admin/users");
  revalidatePath("/admin/dashboard");
}

export async function addUser(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Only admins can add users." };

  const { name, email, password, fieldErrors } = readUserFields(formData);
  if (fieldErrors) return { fieldErrors, values: { name, email } };

  const result = await createUser({ name, email, password });
  if ("error" in result) {
    return {
      fieldErrors: { email: "An account with this email already exists." },
      values: { name, email },
    };
  }

  refreshUserPages();
  return { success: `Account created for ${result.user.email}.` };
}

export async function editUser(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Only admins can edit users." };

  const id = readField(formData, "id");
  const { name, email, password, fieldErrors } = readUserFields(formData, {
    passwordOptional: true,
  });
  if (fieldErrors) return { fieldErrors, values: { name, email } };

  const result = await updateUser(id, { name, email, password: password || undefined });
  if ("error" in result) {
    return result.error === "email_taken"
      ? {
          fieldErrors: { email: "An account with this email already exists." },
          values: { name, email },
        }
      : { error: "This user no longer exists." };
  }

  refreshUserPages();
  return { success: "User updated." };
}

export async function removeUser(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAdmin())) return { error: "Only admins can delete users." };

  const id = readField(formData, "id");
  const deleted = await deleteRegularUser(id);
  if (!deleted) return { error: "This user can't be deleted." };
  await deleteAllForOwner(id);

  refreshUserPages();
  return { success: "User deleted." };
}
