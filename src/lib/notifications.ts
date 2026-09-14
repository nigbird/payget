import nodemailer from 'nodemailer';
import { sendSms } from '@/lib/sms';
import { isValidEmail, isValidPhoneNumber, maskIdentifier } from '@/lib/utils';
import { createOpaqueToken } from '@/lib/opaque-tokens';

/** Default password reset link lifetime (5 minutes). */
export const PASSWORD_RESET_TIMEOUT_SECONDS = 360

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

    console.error('[NOTIFICATION-ERROR] Unsupported contact format: %s', maskIdentifier(to));
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
    console.log('[EMAIL-DISABLED] Would send to %s (subject: %s)', maskIdentifier(email), subject);
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
        rejectUnauthorized: false,
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

    console.log('[EMAIL-SENT] Message ID: %s to %s', info.messageId, maskIdentifier(email));
    return true;
  } catch (error) {
    console.error('[EMAIL-ERROR] Failed to send to %s:', maskIdentifier(email), error);
    return false;
  }
}

/** Escapes values interpolated into email HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type PaymentLinkEmailResult = { ok: true } | { ok: false; error: string };

export async function sendPaymentLinkEmail(params: {
  to: string;
  merchantName: string;
  amount: number;
  currency: string;
  description: string;
  paymentUrl: string;
  expiresAt?: string;
}): Promise<PaymentLinkEmailResult> {
  const { to, merchantName, amount, currency, description, paymentUrl, expiresAt } = params;

  // Only ever put a gateway https URL behind the button.
  if (!/^https:\/\//i.test(paymentUrl)) {
    return { ok: false, error: 'Refusing to send an insecure payment link.' };
  }

  if (process.env.EMAIL_ENABLED !== 'true') {
    return {
      ok: false,
      error: 'Email delivery is disabled. Set EMAIL_ENABLED=true and configure SMTP to send payment links.',
    };
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_EMAIL_USER;
  const pass = process.env.SMTP_EMAIL_PASS;

  if (!host || !user || !pass) {
    return {
      ok: false,
      error: 'SMTP is not fully configured (SMTP_HOST, SMTP_EMAIL_USER, SMTP_EMAIL_PASS).',
    };
  }

  const safeMerchant = escapeHtml(merchantName);
  const safeDescription = escapeHtml(description);
  const formattedAmount = `${amount.toFixed(2)} ${escapeHtml(currency)}`;
  const expiryNote = expiresAt
    ? `<p style="margin:16px 0 0;font-size:12px;color:#8a8a8a;">This payment link expires on ${escapeHtml(
        new Date(expiresAt).toUTCString()
      )}.</p>`
    : '';

  const html = `
  <div style="background:#f6f6f7;padding:28px 12px;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ececec;">
      <tr>
        <td style="padding:24px 28px 8px;">
          <p style="margin:0;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#a07a4f;">Payment request</p>
          <h1 style="margin:6px 0 0;font-size:20px;color:#5b371f;">${safeMerchant} has requested a payment</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 28px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf7f2;border:1px solid #f0e6d8;border-radius:10px;">
            <tr>
              <td style="padding:16px 18px;">
                <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:1.2px;color:#9b8b76;">Amount</p>
                <p style="margin:4px 0 0;font-size:26px;font-weight:bold;color:#5b371f;">${formattedAmount}</p>
                <p style="margin:10px 0 0;font-size:13px;color:#6b6b6b;">${safeDescription}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:26px 28px 6px;">
          <a href="${paymentUrl}" target="_blank" rel="noopener noreferrer"
             style="display:inline-block;background:#754319;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 46px;border-radius:10px;">
            Pay Now
          </a>
          <p style="margin:14px 0 0;font-size:12px;color:#8a8a8a;">
            Click the button above to complete your payment securely.
          </p>
          ${expiryNote}
        </td>
      </tr>
      <tr>
        <td style="padding:20px 28px 24px;">
          <hr style="border:0;border-top:1px solid #eeeeee;margin:0 0 12px;">
          <p style="margin:0;font-size:11px;color:#9b9b9b;line-height:1.6;">
            Payments are processed securely by Mastercard Payment Gateway Services.
            If you did not expect this request, you can safely ignore this email.
            This is an automated message — please do not reply.
          </p>
        </td>
      </tr>
    </table>
  </div>`;

  // Plain-text alternative for clients that cannot render HTML.
  const text = [
    `${merchantName} has requested a payment of ${amount.toFixed(2)} ${currency}.`,
    description,
    '',
    'Complete your payment here:',
    paymentUrl,
  ].join('\n');

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"${merchantName}" <${user}>`,
      to,
      subject: `Payment request from ${merchantName} — ${amount.toFixed(2)} ${currency}`,
      text,
      html,
    });

    console.log('[PAYMENT-LINK-EMAIL] Sent %s to %s', info.messageId, maskIdentifier(to));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown SMTP error';
    console.error('[PAYMENT-LINK-EMAIL] Failed to send to %s:', maskIdentifier(to), error);
    return { ok: false, error: `Could not send the email: ${message}` };
  }
}

/**
 * SMS sender
 */
async function sendSMSNotification(phone: string, message: string): Promise<boolean> {
  const result = await sendSms(phone, message);

  if (!result.ok) {
    console.error('[SMS-ERROR] Failed to send to %s:', maskIdentifier(phone), result);
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