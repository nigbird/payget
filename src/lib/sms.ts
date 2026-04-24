/**
 * Server-side SMS helper.
 * Sends form-encoded POST with `to` and `text` fields to SMS_URL.
 */
export async function sendSms(to: string, text: string) {
  const smsUrl = process.env.SMS_URL;
  if (!smsUrl) {
    console.error("[sms] SMS_URL env var not set");
    return { ok: false, error: "SMS_URL env var not set" };
  }

  // Format phone as local 10-digit number: 0XXXXXXXXX
  const formattedPhone = "0" + to.replace(/\D/g, "").slice(-9);

  try {
    const params = new URLSearchParams();
    params.append("to", formattedPhone);
    params.append("text", text);

    const res = await fetch(smsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const body = await res.text().catch(() => null);

    if (!res.ok) {
      console.error("[sms] send failed", {
        to,
        formattedPhone,
        status: res.status,
        body,
      });
      return { ok: false, status: res.status, body };
    }

    console.info("[sms] sent", { to, formattedPhone, status: res.status });
    return { ok: true, status: res.status, body };
  } catch (err: any) {
    console.error("[sms] exception sending", {
      to,
      formattedPhone,
      error: String(err?.message ?? err),
    });
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export default sendSms;
