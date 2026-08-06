import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { webLogger } from "@/observability/server";
import type { AuthSmtpConfiguration } from "./config";

type AuthenticationEmailKind = "password-reset" | "verification";

type AuthenticationEmail = {
  html: string;
  subject: string;
  text: string;
};

const globalMailer = globalThis as typeof globalThis & {
  spectraAuthEmailTransport?: Transporter;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function authenticationEmail(
  kind: AuthenticationEmailKind,
  url: string,
): AuthenticationEmail {
  const verification = kind === "verification";
  const subject = verification ? "验证你的 Spectra 邮箱" : "重设你的 Spectra 密码";
  const heading = verification ? "验证邮箱" : "重设密码";
  const description = verification
    ? "请验证这个邮箱地址，随后即可完成 Spectra 账号设置。"
    : "我们收到了重设 Spectra 密码的请求。";
  const action = verification ? "验证邮箱" : "重设密码";
  const safeUrl = escapeHtml(url);

  return {
    subject,
    text: `${description}\n\n${action}: ${url}\n\n此链接将在 1 小时后失效。如果这不是你本人发起的操作，可以忽略此邮件。`,
    html: `<main style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937"><p style="font-size:14px;font-weight:700;color:#2563eb;letter-spacing:.08em">SPECTRA</p><h1 style="font-size:24px;line-height:1.3">${heading}</h1><p style="font-size:16px;line-height:1.7">${description}</p><p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;border-radius:10px;background:#2563eb;padding:12px 20px;color:#fff;font-weight:700;text-decoration:none">${action}</a></p><p style="font-size:14px;line-height:1.6;color:#6b7280">此链接将在 1 小时后失效。如果这不是你本人发起的操作，可以忽略此邮件。</p></main>`,
  };
}

function authEmailTransport(configuration: AuthSmtpConfiguration) {
  if (!globalMailer.spectraAuthEmailTransport) {
    globalMailer.spectraAuthEmailTransport = nodemailer.createTransport({
      auth: { pass: configuration.password, user: configuration.user },
      host: configuration.host,
      port: configuration.port,
      secure: configuration.secure,
    });
  }
  return globalMailer.spectraAuthEmailTransport;
}

export async function sendAuthenticationEmail(
  configuration: AuthSmtpConfiguration,
  recipient: string,
  kind: AuthenticationEmailKind,
  url: string,
) {
  const message = authenticationEmail(kind, url);
  await authEmailTransport(configuration).sendMail({
    from: configuration.from,
    html: message.html,
    subject: message.subject,
    text: message.text,
    to: recipient,
  });
}

export function reportAuthenticationEmailFailure() {
  webLogger.error({ event: "auth.email.delivery_failed" }, "Authentication email delivery failed");
}
