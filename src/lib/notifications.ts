import nodemailer from 'nodemailer';
import { sendSms } from '@/lib/sms';
import { isValidEmail, isValidPhoneNumber } from '@/lib/utils';
import { createOpaqueToken } from '@/lib/opaque-tokens';

/** Default password reset link lifetime (5 minutes). 
export const PASSWORD_RESET_TIMEOUT_SECONDS = 300

export function passwordResetExpiryDate(timeoutSeconds: number = PASSWORD_RESET_TIMEOUT_SECONDS): Date {
  return new Date(Date.now() + timeoutSeconds * 1000)
}

export function formatPasswordResetExpiryMessage(timeoutSeconds: number = PASSWORD_RESET_TIMEOUT_SECONDS): string {
  const minutes = Math.max(1, Math.round(timeoutSeconds / 60))
  return minutes === 1 ? "1 minute" : `${minutes} minutes`
}

/**
 * Notification system abstraction for Email and SMS.
 */

export interface NotificationPayload {
  to: string;
  subject?: string;
  message: string;
}

/**
 * Main notification handler
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  const { to, subject, message } = payload;

  const isEmail = isValidEmail(to);
  const isPhone = !isEmail && isValidPhoneNumber(to);

  try {
    if (isEmail) {
      return await sendEmailNotification(to, subject || 'Notification', message);
    } else if (isPhone) {
      return await sendSMSNotification(to, message);
    }

    console.error(`[NOTIFICATION-ERROR] Unsupported contact format: ${to}`);
    return false;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

/**
 * Email sender (SMTP via Nodemailer)
 */
async function sendEmailNotification(
  email: string,
  subject: string,
  message: string
): Promise<boolean> {
  const emailEnabled = process.env.EMAIL_ENABLED === 'true';

  if (!emailEnabled) {
    console.log(`[EMAIL-DISABLED] Log only: Sending to ${email}`);
    console.log(`[EMAIL-DISABLED] Subject: ${subject}`);
    console.log(`[EMAIL-DISABLED] Message: ${message}`);
    return true;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_EMAIL_USER,
        pass: process.env.SMTP_EMAIL_PASS,
      },
      tls: {
        rejectUnauthorized: false, //  bypass SSL certificate issue
      },
    });

    const info = await transporter.sendMail({
      from: `"NibTera Merchants" <${process.env.SMTP_EMAIL_USER}>`,
      to: email,
      subject: subject,
      text: message,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px;">
          <h2 style="color: #754319;">${subject}</h2>
          <p style="font-size: 16px; line-height: 1.5; color: #333;">
            ${message.replace(/\n/g, '<br>')}
          </p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 12px; color: #999;">
            This is an automated message from NibTera Merchants. Please do not reply directly to this email.
          </p>
        </div>
      `,
    });

    console.log(`[EMAIL-SENT] Message ID: ${info.messageId} to ${email}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL-ERROR] Failed to send to ${email}:`, error);
    return false;
  }
}

/**
 * SMS sender
 */
async function sendSMSNotification(phone: string, message: string): Promise<boolean> {
  const result = await sendSms(phone, message);

  if (!result.ok) {
    console.error(`[SMS-ERROR] Failed to send to ${phone}:`, result);
    return false;
  }

  return true;
}

function getNotificationBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_BASE_URL must be configured for notification links');
  }

  return baseUrl.replace(/\/$/, '');
}

/**
 * Password setup link (uses opaque token)
 */
export async function generatePasswordSetupLink(merchantId: string, originalToken: string): Promise<string> {
  const baseUrl = getNotificationBaseUrl();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const opaqueToken = await createOpaqueToken('PASSWORD_SETUP', { merchantId, originalToken }, expiresAt);

  return `${baseUrl}/l/${opaqueToken}`;
}

/**
 * Merchant update link (magic link, uses opaque token)
 */
export async function generateMerchantUpdateLink(originalToken: string): Promise<string> {
  const baseUrl = getNotificationBaseUrl();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const opaqueToken = await createOpaqueToken('MERCHANT_UPDATE', { originalToken }, expiresAt);

  return `${baseUrl}/l/${opaqueToken}`;
}

/**
 * Reset password link (uses opaque token)
 */
export async function generateResetPasswordLink(
  originalToken: string,
  expiresAt: Date = passwordResetExpiryDate()
): Promise<string> {
  const baseUrl = getNotificationBaseUrl();
  const opaqueToken = await createOpaqueToken('RESET_PASSWORD', { originalToken }, expiresAt);

  return `${baseUrl}/l/${opaqueToken}`;
}

/**
 * Payment link (uses opaque token)
 */
export async function generatePaymentLink(originalToken: string): Promise<string> {
  const baseUrl = getNotificationBaseUrl();
  const ttlMinutes = Number(process.env.PAYMENT_LINK_TTL_MINUTES ?? 10);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  const opaqueToken = await createOpaqueToken('PAYMENT', { originalToken }, expiresAt);

  return `${baseUrl}/l/${opaqueToken}`;
}

/**
 * Merchant registration link
 */
export function generateMerchantRegisterLink(): string {
  const baseUrl = getNotificationBaseUrl();
  return `${baseUrl}/register`;
}