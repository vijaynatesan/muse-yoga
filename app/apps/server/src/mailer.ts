import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import nodemailer from "nodemailer";
import { MAIL_DIR } from "./store.js";

// Mailer interface (design §1.5): gmail via Google SMTP, or file (Mailpit-profile local equivalent).
export async function sendOtpEmail(to: string, code: string, purpose: string): Promise<{ mode: string }> {
  const mode = process.env.MAILER || "file";
  const subject = `Muse Yoga ${purpose} code`;
  const text = `Your Muse Yoga ${purpose} code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`;
  if (mode === "gmail") {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_APP_PASSWORD || "" },
    });
    await transport.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text });
    return { mode };
  }
  // file mailer: local inbox under data/mail (equivalent of Mailpit UI for offline dev)
  mkdirSync(MAIL_DIR, { recursive: true });
  const file = join(MAIL_DIR, `${Date.now()}-${to.replace(/[^a-z0-9]/gi, "_")}.json`);
  writeFileSync(file, JSON.stringify({ to, subject, text, code, purpose, at: new Date().toISOString() }, null, 1));
  return { mode };
}
