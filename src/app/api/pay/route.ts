import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthUser } from "@/lib/request-auth";
import { writeAuditLog } from "@/lib/audit-log";
import { requireCsrf } from '@/lib/request-security';

export async function POST(request: Request) {
  let actorUserId: string | null = null;

  try {
    const authUser = await requireAuthUser(request);
    actorUserId = authUser?.id ?? null;

    const body = await request.json();
    const { merchantId, amount, callbackUrl, description, payerPhone, payerAccount } = body;

    // 1. Basic Validation
    if (!merchantId || !amount || !callbackUrl) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_REQUIRED_FIELDS" },
      });

      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. Merchant Status Check
    const merchant = await db.getMerchantById(merchantId);
    if (!merchant) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: { result: "failed", reason: "MERCHANT_NOT_FOUND", merchantId },
      });

      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    if (merchant.status !== "approved") {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "MERCHANT_NOT_ACTIVE",
          merchantId,
          merchantStatus: merchant.status,
        },
      });

      return NextResponse.json({ error: "Merchant account is not active" }, { status: 403 });
    }

    // 3. Limit Checks (Amount)
    if (amount > merchant.transactionLimit) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "AMOUNT_EXCEEDS_TRANSACTION_LIMIT",
          merchantId,
          amount,
          limit: merchant.transactionLimit,
        },
      });

      return NextResponse.json(
        {
          error: "Transaction amount exceeds per-transaction limit",
          limit: merchant.transactionLimit,
        },
        { status: 400 }
      );
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { totalAmount: totalTodayAmount, count: todayTxCount } = await db.getMerchantSuccessStatsSince(
      merchantId,
      startOfDay
    );
    if (totalTodayAmount + amount > merchant.dailyLimit) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "DAILY_AMOUNT_LIMIT_REACHED",
          merchantId,
          amount,
          totalTodayAmount,
          limit: merchant.dailyLimit,
        },
      });

      return NextResponse.json(
        {
          error: "Daily processing amount limit reached",
          limit: merchant.dailyLimit,
        },
        { status: 400 }
      );
    }

    // 4. Limit Checks (Count)
    if (todayTxCount >= merchant.dailyCountLimit) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "PAYMENT_INITIATE",
        entityType: "TRANSACTION",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "DAILY_TRANSACTION_COUNT_LIMIT_REACHED",
          merchantId,
          count: todayTxCount,
          limit: merchant.dailyCountLimit,
        },
      });

      return NextResponse.json(
        {
          error: "Daily transaction count limit reached",
          limit: merchant.dailyCountLimit,
        },
        { status: 400 }
      );
    }

    // 5. Process Payment (Simulated)
    const transactionId = `tx_${Math.random().toString(36).substr(2, 9)}`;
    const isSuccess = Math.random() > 0.1;

    const tx: any = {
      id: transactionId,
      merchantId,
      amount,
      status: isSuccess ? "success" : "failed",
      callbackUrl,
      description: description || "Payment initiation",
      timestamp: new Date().toISOString(),
      payerPhone: payerPhone,
      payerAccount: payerAccount,
      transactionReference: `ref${transactionId.replaceAll("_", "")}`,
      serviceDescription: description || "Payment initiation",
      transactionTimestamp: new Date().toISOString(),
      userCredentials: {
        phone: "unknown",
        authToken: "legacy_demo_auth",
      },
    };

    await db.addTransaction(tx);

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_INITIATE",
      entityType: "TRANSACTION",
      entityId: transactionId,
      newValue: {
        result: "success",
        status: tx.status,
        merchantId,
        amount,
      },
    });

    return NextResponse.json({
      transactionId: tx.id,
      status: tx.status,
      message: isSuccess ? "Payment processed successfully" : "Payment processing failed",
    });
  } catch (error) {
    console.error("Payment error:", error);

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "PAYMENT_INITIATE",
      entityType: "TRANSACTION",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
