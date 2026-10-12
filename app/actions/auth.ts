"use server";

import { redirect } from "next/navigation";
import { homeFor } from "@/app/lib/dal";
import { checkEmailCanReceive } from "@/app/lib/email-check";
import {
  CODE_MINUTES,
  clearChallenge,
  refreshChallenge,
  startChallenge,
  verifyChallenge,
} from "@/app/lib/login-codes";
import { sendLoginCode } from "@/app/lib/mailer";
import { createSession, deleteSession } from "@/app/lib/session";
import { createUser, findUserById, hasAdmin, verifyCredentials } from "@/app/lib/users";
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
  const emailError = await checkEmailCanReceive(email);
  if (emailError) return { fieldErrors: { email: emailError }, values: { name, email } };

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

/** "name@example.com" becomes "na••••@example.com". */
function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}

async function sendCode(user: { email: string; name: string }, code: string, minutes: number) {
  try {
    await sendLoginCode(user, code, minutes);
    return true;
  } catch (error) {
    console.error("Login code email failed", error);
    return false;
  }
}

const ADMIN_ON_USER_PAGE = "Admin accounts must sign in from the admin login page.";

/** User sign-in: password step, then the emailed code step. */
export async function login(_state: FormState, formData: FormData): Promise<FormState> {
  const intent = readField(formData, "intent");

  if (intent === "restart") {
    await clearChallenge();
    return undefined;
  }

  if (intent === "verify" || intent === "resend") {
    const email = readField(formData, "otpEmail");

    if (intent === "resend") {
      const fresh = await refreshChallenge();
      if ("error" in fresh) {
        return fresh.restart ? { error: fresh.error, values: { email } } : { error: fresh.error, otp: { email } };
      }
      const user = await findUserById(fresh.userId);
      if (!user || !(await sendCode(user, fresh.code, fresh.minutesLeft))) {
        return { error: "We couldn't send a new code. Try again in a moment.", otp: { email } };
      }
      return { success: `We sent a new code to ${maskEmail(user.email)}.`, otp: { email } };
    }

    const result = await verifyChallenge(readField(formData, "code").replace(/\s/g, ""));
    if (!result.ok) {
      return result.restart ? { error: result.error, values: { email } } : { error: result.error, otp: { email } };
    }
    if (result.role !== "user") return { error: ADMIN_ON_USER_PAGE, values: { email } };
    await createSession(result.userId);
    redirect("/dashboard");
  }

  const email = readField(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required.", values: { email } };

  const user = await verifyCredentials(email, password);
  if (!user) return { error: "Invalid email or password.", values: { email } };
  if (user.role !== "user") return { error: ADMIN_ON_USER_PAGE, values: { email } };

  const code = await startChallenge(user);
  if (!(await sendCode(user, code, CODE_MINUTES))) {
    await clearChallenge();
    return {
      error: "We couldn't send a login code to this email address. Ask your admin to check it.",
      values: { email },
    };
  }
  return { success: `We sent a 6-digit code to ${maskEmail(user.email)}.`, otp: { email: user.email } };
}

/** Admins sign in with email and password only; login codes are for user accounts. */
export async function adminLogin(_state: FormState, formData: FormData): Promise<FormState> {
  const email = readField(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required.", values: { email } };

  const user = await verifyCredentials(email, password);
  if (!user) return { error: "Invalid email or password.", values: { email } };
  if (user.role !== "admin") return { error: "This account does not have admin access.", values: { email } };

  await createSession(user.id);
  redirect("/admin/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
