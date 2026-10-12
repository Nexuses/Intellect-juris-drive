import "server-only";
import { resolveMx } from "node:dns/promises";

const LOOKUP_TIMEOUT_MS = 5000;
const MISSING_DOMAIN_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/**
 * Checks that the email's domain is set up to receive mail. Returns an error message,
 * or null when it can (or when DNS can't be reached, so a slow network never blocks admins).
 */
export async function checkEmailCanReceive(email: string): Promise<string | null> {
  const domain = email.split("@")[1];
  if (!domain) return "Enter a valid email.";

  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), LOOKUP_TIMEOUT_MS),
      ),
    ]);
    const usable = records.some((record) => record.exchange && record.exchange !== ".");
    return usable ? null : `${domain} does not accept email. Enter a real email address.`;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (MISSING_DOMAIN_CODES.has(code)) return `${domain} does not accept email. Enter a real email address.`;
    return null;
  }
}
