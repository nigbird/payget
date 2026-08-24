import { safeJsonParse } from "@/lib/json-utils";

const DEFAULT_BASE_URL = "https://na-gateway.mastercard.com";
const DEFAULT_API_VERSION = "100";

export type MpgsConfig = {
  baseUrl: string;
  apiVersion: string;
  merchantId: string;
  password: string;
};

export function resolveMpgsConfig(): MpgsConfig {
  const merchantId = process.env.MPGS_MERCHANT_ID?.trim();
  const password = process.env.MPGS_PASSWORD?.trim();

  if (!merchantId || !password) {
    throw new Error(
      "MPGS credentials not configured (MPGS_MERCHANT_ID, MPGS_PASSWORD)",
    );
  }

  return {
    baseUrl: (process.env.MPGS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(
      /\/$/,
      "",
    ),
    apiVersion: process.env.MPGS_API_VERSION?.trim() || DEFAULT_API_VERSION,
    merchantId,
    password,
  };
}

/** Reads a positive number from the environment, ignoring blank/garbage values. */
export function positiveEnvNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}


export function nonNegativeEnvNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function mpgsLinkLifetimeMs(): number {
  const minutes = Number(process.env.MPGS_LINK_EXPIRY_MINUTES?.trim());
  if (Number.isFinite(minutes) && minutes > 0) return minutes * 60_000;
  return positiveEnvNumber(process.env.MPGS_LINK_EXPIRY_DAYS, 7) * 86_400_000;
}

export function mpgsAllowedAttempts(): number {
  const attempts = positiveEnvNumber(process.env.MPGS_LINK_ALLOWED_ATTEMPTS, 3);
  return Math.max(1, Math.floor(attempts));
}

export type MpgsPaymentLinkRequest = {
  /** Gateway order id; must be unique per MPGS merchant. */
  orderId: string;
  amount: number;
  currency: string;
  description: string;
  merchantName: string;
  merchantUrl: string;
  errorUrl: string;
  /** ISO-8601 UTC, e.g. 2026-08-30T07:56:26.123Z */
  expiryDateTime: string;
  numberOfAllowedAttempts: number;
};

export type MpgsPaymentLinkResult =
  | {
      ok: true;
      paymentLinkUrl: string;
      paymentLinkId?: string;
      sessionId?: string;
      successIndicator?: string;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

/** Basic auth header shared by every gateway call. */
function authHeader(config: MpgsConfig): string {
  const username = `merchant.${config.merchantId}`;
  return `Basic ${Buffer.from(`${username}:${config.password}`, "utf8").toString("base64")}`;
}

/**
 * Creates a gateway-hosted payment link for a single order.
 */
export async function createMpgsPaymentLink(
  input: MpgsPaymentLinkRequest,
): Promise<MpgsPaymentLinkResult> {
  const config = resolveMpgsConfig();

  const url = `${config.baseUrl}/api/rest/version/${config.apiVersion}/merchant/${config.merchantId}/session`;

  const body = {
    apiOperation: "INITIATE_CHECKOUT",
    checkoutMode: "PAYMENT_LINK",
    interaction: {
      operation: "PURCHASE",
      merchant: {
        name: input.merchantName,
        url: input.merchantUrl,
      },
    },
    order: {
      currency: input.currency,
      amount: input.amount.toFixed(2),
      id: input.orderId,
      description: input.description,
    },
    paymentLink: {
      expiryDateTime: input.expiryDateTime,
      numberOfAllowedAttempts: input.numberOfAllowedAttempts,
      errorUrl: input.errorUrl,
    },
  };

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader(config),
      },
      body: JSON.stringify(body),
    });
    text = await response.text();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "MPGS request failed";
    console.error("[MPGS] Network error creating payment link:", {
      orderId: input.orderId,
      message,
    });
    return {
      ok: false,
      error: "Could not reach the Mastercard gateway.",
      status: 502,
    };
  }

  let data: any;
  try {
    data = safeJsonParse(text);
  } catch {
    console.error("[MPGS] Non-JSON response:", {
      orderId: input.orderId,
      status: response.status,
    });
    return {
      ok: false,
      error: `Invalid gateway response (${response.status}).`,
      status: 502,
    };
  }

  if (!response.ok) {
    const message =
      data?.error?.explanation ||
      data?.error?.cause ||
      data?.message ||
      `Gateway rejected the request (${response.status}).`;
    console.error("[MPGS] Gateway error:", {
      orderId: input.orderId,
      status: response.status,
      message,
    });
    return { ok: false, error: message, status: response.status };
  }

  const paymentLinkUrl = data?.paymentLink?.url;
  if (!paymentLinkUrl) {
    console.error("[MPGS] Success response missing paymentLink.url:", {
      orderId: input.orderId,
    });
    return {
      ok: false,
      error: "No payment link returned by the gateway.",
      status: 502,
    };
  }


  return {
    ok: true,
    paymentLinkUrl,
    paymentLinkId: data?.paymentLink?.id,
    sessionId: data?.session?.id,
    successIndicator: data?.successIndicator,
  };
}

export type MpgsOrderOutcome = "success" | "failed" | "pending" | "not_found";

export type MpgsOrderResult =
  | {
      ok: true;
      outcome: MpgsOrderOutcome;
      gatewayStatus?: string;
      gatewayResult?: string;
      amount?: number;
      currency?: string;
      /** Gateway transaction receipts, useful for reconciliation. */
      receipts: string[];
      /** Payment attempts the gateway has recorded against this order. */
      attempts: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

// For an INITIATE_CHECKOUT / PURCHASE order, funds are settled at CAPTURED.
// AUTHORIZED is deliberately treated as non-terminal: the money is only held.
const SUCCESS_ORDER_STATUSES = new Set([
  "CAPTURED",
  "PARTIALLY_CAPTURED",
  "DISBURSED",
]);
const FAILED_ORDER_STATUSES = new Set([
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "DECLINED",
]);

export async function retrieveMpgsOrder(
  orderId: string,
): Promise<MpgsOrderResult> {
  const config = resolveMpgsConfig();
  const url = `${config.baseUrl}/api/rest/version/${config.apiVersion}/merchant/${config.merchantId}/order/${encodeURIComponent(orderId)}`;

  let response: Response;
  let text: string;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader(config) },
    });
    text = await response.text();
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "MPGS request failed";
    console.error("[MPGS] Network error retrieving order:", {
      orderId,
      message,
    });
    return {
      ok: false,
      error: "Could not reach the Mastercard gateway.",
      status: 502,
    };
  }

  let data: any;
  try {
    data = safeJsonParse(text);
  } catch {
    return {
      ok: false,
      error: `Invalid gateway response (${response.status}).`,
      status: 502,
    };
  }

  if (response.status === 404) {
    console.log("[MPGS] Order not found (404):", { orderId });
    return { ok: true, outcome: "not_found", receipts: [], attempts: 0 };
  }

  if (!response.ok) {
   const explanation = String(data?.error?.explanation ?? "");
    if (
      /unable to find order|does not exist|no such order|not found/i.test(
        explanation,
      )
    ) {
      
      return { ok: true, outcome: "not_found", receipts: [], attempts: 0 };
    }
    const message =
      explanation ||
      data?.error?.cause ||
      `Gateway error (${response.status}).`;
    console.error("[MPGS] Order retrieval error:", {
      orderId,
      status: response.status,
      message,
    });
    return { ok: false, error: message, status: response.status };
  }

  const gatewayStatus =
    typeof data?.status === "string" ? data.status.toUpperCase() : undefined;
  const gatewayResult =
    typeof data?.result === "string" ? data.result.toUpperCase() : undefined;

  let outcome: MpgsOrderOutcome = "pending";
  if (gatewayStatus && SUCCESS_ORDER_STATUSES.has(gatewayStatus)) {
    outcome = "success";
  } else if (gatewayStatus && FAILED_ORDER_STATUSES.has(gatewayStatus)) {
    outcome = "failed";
  }

  const receipts: string[] = Array.isArray(data?.transaction)
    ? data.transaction
        .map((t: any) => t?.transaction?.receipt ?? t?.receipt)
        .filter(
          (r: unknown): r is string => typeof r === "string" && r.length > 0,
        )
    : [];

  const attempts: number = Array.isArray(data?.transaction)
    ? data.transaction.length
    : 0;

   console.log("[MPGS] Order retrieved:", {
    orderId,
    status: gatewayStatus,
    result: gatewayResult,
    attempts,
    transactions: Array.isArray(data?.transaction)
      ? data.transaction.map((t: any) => ({
          type: t?.transaction?.type ?? t?.type,
          result: t?.result,
          gatewayCode: t?.response?.gatewayCode,
        }))
      : null,
  });

  return {
    ok: true,
    outcome,
    gatewayStatus,
    gatewayResult,
    amount: typeof data?.amount === "number" ? data.amount : undefined,
    currency: typeof data?.currency === "string" ? data.currency : undefined,
    receipts,
    attempts,
  };
}
