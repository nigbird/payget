import { NextResponse } from 'next/server';
import { db, sanitizeTransaction } from '@/app/lib/db';
import { requireAuthUser, canAccessMerchant } from '@/lib/request-auth';
import { transactionMatchesTeamMember } from '@/lib/transaction-initiator';

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
    const teamMemberId = (user as { teamMemberId?: string }).teamMemberId;
    const members = await db.getMerchantTeamMembersByMerchantId(id);
    const selfMember =
      (teamMemberId && members.find((m) => m.id === teamMemberId)) ||
      members.find(
        (m) =>
          m.phone &&
          (user.id === `sales-${m.phone}` ||
            user.id.replace(/^sales-/, "").replace(/\D/g, "") === m.phone.replace(/\D/g, ""))
      );

    visibleTransactions = transactions.filter((tx) => {
      if (tx.userCredentials.initiatedById === user.id) return true;
      if (selfMember && transactionMatchesTeamMember(tx, selfMember)) return true;
      return false;
    });
  }

  return NextResponse.json(visibleTransactions.map(sanitizeTransaction));
}
