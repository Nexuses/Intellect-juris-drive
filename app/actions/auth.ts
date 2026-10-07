"use server";

import { redirect } from "next/navigation";
import { homeFor } from "@/app/lib/dal";
import { createSession, deleteSession } from "@/app/lib/session";
import { createUser, hasAdmin, verifyCredentials } from "@/app/lib/users";
import { readField, readUserFields, type FormState } from "@/app/lib/validation";

export async function setupAdmin(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  if (await hasAdmin()) {
    return { error: "An admin account already exists. Please log in." };
  }

  const { name, email, password, fieldErrors } = readUserFields(formData);
  if (fieldErrors) return { fieldErrors, values: { name, email } };

  const result = await createUser({ name, email, password });
  if ("error" in result) {
    return {
      fieldErrors: { email: "An account with this email already exists." },
      values: { name, email },
    };
  }

  await createSession(result.user.id);
  redirect(homeFor(result.user.role));
}

async function authenticate(formData: FormData) {
  const email = readField(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { email, user: null, error: "Email and password are required." };
  }

  const user = await verifyCredentials(email, password);
  return {
    email,
    user,
    error: user ? undefined : "Invalid email or password.",
  };
}

export async function login(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email, user, error } = await authenticate(formData);
  if (!user) return { error, values: { email } };
  if (user.role !== "user") {
    return {
      error: "Admin accounts must sign in from the admin login page.",
      values: { email },
    };
  }

  await createSession(user.id);
  redirect("/dashboard");
}

export async function adminLogin(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { email, user, error } = await authenticate(formData);
  if (!user) return { error, values: { email } };
  if (user.role !== "admin") {
    return { error: "This account does not have admin access.", values: { email } };
  }

  await createSession(user.id);
  redirect("/admin/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
