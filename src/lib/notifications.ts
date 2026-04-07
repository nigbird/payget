import nodemailer from 'nodemailer';

/**
 * Notification system abstraction for Email and SMS.
 * Configured via environment variables for different providers.
 */

export interface NotificationPayload {
  to: string; // Email or Phone Number
  subject?: string;
  message: string;
}

/**
 * Sends a notification via Email or SMS depending on the 'to' format.
 */
export async function sendNotification(payload: NotificationPayload): Promise<boolean> {
  const { to, subject, message } = payload;
  
  const isEmail = to.includes('@');
  
  try {
    if (isEmail) {
      return await sendEmailNotification(to, subject || 'Notification', message);
    } else {
      return await sendSMSNotification(to, message);
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

/**
 * Email provider integration using Nodemailer for SMTP.
 */
async function sendEmailNotification(email: string, subject: string, message: string): Promise<boolean> {
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
    });

    const info = await transporter.sendMail({
      from: `"Finflow Gateway" <${process.env.SMTP_EMAIL_USER}>`,
      to: email,
      subject: subject,
      text: message,
      html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 600px;">
        <h2 style="color: #754319;">${subject}</h2>
        <p style="font-size: 16px; line-height: 1.5; color: #333;">${message.replace(/\n/g, '<br>')}</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">This is an automated message from Finflow Gateway. Please do not reply directly to this email.</p>
      </div>`,
    });

    console.log(`[EMAIL-SENT] Message ID: ${info.messageId} to ${email}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL-ERROR] Failed to send to ${email}:`, error);
    return false;
  }
}

/**
 * Placeholder for SMS provider integration (e.g., Twilio, MessageBird, Infobip).
 */
async function sendSMSNotification(phone: string, message: string): Promise<boolean> {
  // Current logic for SMS is console log only until a provider is configured
  console.log(`[SMS] Sending to: ${phone}`);
  console.log(`[SMS] Message: ${message}`);
  
  return true;
}

/**
 * Generates a secure link for password setup.
 */
export function generatePasswordSetupLink(merchantId: string, token: string): string {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
    'http://localhost:3000';

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  return `${normalizedBaseUrl}/merchant/setup-password?merchantId=${merchantId}&token=${token}`;
}
