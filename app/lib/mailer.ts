import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { LOGO_HEIGHT, LOGO_URL, LOGO_WIDTH } from "./brand";

let transporter: Transporter | null = null;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
}

function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: required("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: required("SMTP_USER"), pass: required("SMTP_PASS") },
  });
  return transporter;
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

const LOGO_EMAIL_WIDTH = 150;

/** Table-based layout with inline styles so it renders the same in Gmail, Outlook and mobile mail apps. */
export function loginCodeHtml(name: string, code: string, minutes: number) {
  const logoHeight = Math.round((LOGO_EMAIL_WIDTH * LOGO_HEIGHT) / LOGO_WIDTH);
  const font = "font-family:Arial,Helvetica,sans-serif;";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Your Intellect Juris login code</title>
</head>
<body style="margin:0;padding:0;background:#faf8f3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your login code is ${code}. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#faf8f3;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:1px solid #ebe4d6;border-radius:16px;">
        <tr>
          <td align="center" style="padding:36px 32px 24px;">
            <img src="${LOGO_URL}" width="${LOGO_EMAIL_WIDTH}" height="${logoHeight}" alt="Intellect Juris Law Offices" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:${LOGO_EMAIL_WIDTH}px;height:auto;">
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid #ebe4d6;font-size:0;line-height:0;height:24px;">&nbsp;</td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px;${font}color:#292d30;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#292d30;">Your login code</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#55595c;">Hello ${name}, enter this code on the login page to finish signing in.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
              <tr>
                <td align="center" style="background:#f3eee4;border:1px solid #e3d8c3;border-radius:12px;padding:16px 28px 16px 38px;${font}font-size:34px;line-height:1;font-weight:700;letter-spacing:10px;color:#292d30;">${code}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 0;${font}">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#55595c;">This code expires in <strong style="color:#292d30;">${minutes} minutes</strong>.</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 32px 32px;${font}">
            <p style="margin:0;padding:14px 16px;background:#faf8f3;border-radius:10px;font-size:12px;line-height:1.6;color:#7a7e81;">If you didn't try to sign in, you can ignore this email. Never share this code with anyone.</p>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr>
          <td align="center" style="padding:20px 16px 0;${font}font-size:12px;line-height:1.6;color:#a58b60;">
            Intellect Juris Law Offices<br>
            <span style="color:#9a9ea1;">Your firm's documents, secure and organized in one place.</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export async function sendLoginCode(to: { email: string; name: string }, code: string, minutes: number) {
  await getTransporter().sendMail({
    from: { name: "Intellect Juris", address: required("FROM_EMAIL") },
    to: { name: to.name, address: to.email },
    subject: `${code} is your Intellect Juris login code`,
    text: [
      `Hello ${to.name},`,
      "",
      `Your Intellect Juris login code is ${code}.`,
      `It expires in ${minutes} minutes.`,
      "",
      "If you didn't try to sign in, ignore this email and tell your admin.",
    ].join("\n"),
    html: loginCodeHtml(escapeHtml(to.name), code, minutes),
  });
}
