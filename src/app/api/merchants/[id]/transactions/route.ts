import { NextResponse } from 'next/server';
import { db, sanitizeTransaction } from '@/lib/db';
import { requireAuthUser, canAccessMerchant } from '@/lib/request-auth';
import { transactionMatchesTeamMember, findSelfTeamMember, isQrCustomerTransaction } from '@/lib/transaction-initiator';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireAuthUser(request);

  if (!user?.id || !user.role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!canAccessMerchant(user, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const transactions = await db.getTransactionsByMerchant(id);

  let visibleTransactions = transactions;
  if (user.role === 'SALES') {
    const members = await db.getMerchantTeamMembersByMerchantId(id);
    const selfMember = findSelfTeamMember(members, user as { id: string; teamMemberId?: string });

    if (selfMember?.role === 'sales_admin') {
      // Sales admins see every transaction for the merchant, same as an account admin.
      visibleTransactions = transactions;
    } else {
      visibleTransactions = transactions.filter((tx) => {
        if (isQrCustomerTransaction(tx)) return true;
        if (tx.userCredentials.initiatedById === user.id) return true;
        if (selfMember && transactionMatchesTeamMember(tx, selfMember)) return true;
        return false;
      });
    }
  }

  return NextResponse.json(visibleTransactions.map(sanitizeTransaction));
}
