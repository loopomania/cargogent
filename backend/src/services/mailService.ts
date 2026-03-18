import nodemailer from "nodemailer";
import { config } from "../config/index.js";

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465, // true for 465, false for other ports
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass,
  },
});

export async function sendMail(to: string, subject: string, html: string) {
  if (!config.smtpHost) {
    console.warn(`[MailService] Mock sending email to ${to}: ${subject}`);
    return;
  }
  
  try {
    const info = await transporter.sendMail({
      from: config.smtpFrom,
      to,
      subject,
      html,
    });
    console.log(`[MailService] Message sent: ${info.messageId}`);
  } catch (error) {
    console.error("[MailService] Failed to send email:", error);
    throw new Error("Failed to send email");
  }
}
