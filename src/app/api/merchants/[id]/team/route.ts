import { NextResponse } from 'next/server';
import { db } from '@/app/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const members = await db.getMerchantTeamMembersByMerchantId(id);
  return NextResponse.json(members);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const member = await db.addMerchantTeamMember({
      ...body,
      merchantId: id
    });
    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    console.error('Error adding team member:', error);
    return NextResponse.json({ error: 'Failed to add team member' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { memberId, ...data } = body;
    
    if (data.active !== undefined) {
      const updated = await db.setMerchantTeamMemberActive(memberId, data.active);
      return NextResponse.json(updated);
    } else {
      const updated = await db.updateMerchantTeamMember(memberId, data);
      return NextResponse.json(updated);
    }
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 });
  }
}
