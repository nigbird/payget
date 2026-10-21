import { NextResponse } from 'next/server';
import { db, sanitizeTransaction } from '@/lib/db';
import { canReadTransaction } from '@/lib/payer-token';

/**
 * Transaction details for its payer (payer token from the checkout / payment
 * link) or for a logged-in user who can access the merchant. Anyone else gets
 * the same 404 as for an unknown id, so ids can't be probed.
 *
 * There is deliberately no PATCH: payment status is set only by the provider
 * callback, the status poll and reconciliation. The old handler let any
 * logged-in user mark any transaction as paid.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const transaction = await db.getTransactionById(id);
  if (!transaction || !(await canReadTransaction(request, transaction))) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }
  return NextResponse.json(sanitizeTransaction(transaction));
}
