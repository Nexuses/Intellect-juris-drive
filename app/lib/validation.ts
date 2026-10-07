export type FormState =
  | {
      error?: string;
      success?: string;
      fieldErrors?: { name?: string; email?: string; password?: string };
      values?: { name?: string; email?: string };
    }
  | undefined;

type FieldErrors = NonNullable<NonNullable<FormState>["fieldErrors"]>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function readUserFields(formData: FormData, { passwordOptional = false } = {}) {
  const name = readField(formData, "name");
  const email = readField(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  const fieldErrors: FieldErrors = {};
  if (name.length < 2) fieldErrors.name = "Name must be at least 2 characters.";
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Enter a valid email.";
  if (!(passwordOptional && password === "") && password.length < 8) {
    fieldErrors.password = "Password must be at least 8 characters.";
  }

  return {
    name,
    email,
    password,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : null,
  };
}
