import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { hasPermission } from '@/lib/rbac';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Check for user management permission
    const canManage = await hasPermission('USER_CREATE');
    if (!canManage) {
      return NextResponse.json({ error: 'Permission denied: USER_CREATE required' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.customRoleId !== undefined) updateData.customRoleId = body.customRoleId;
    if (body.isHeadOffice !== undefined) updateData.isHeadOffice = body.isHeadOffice;
    if (body.district !== undefined) updateData.district = body.district;
    if (body.branch !== undefined) updateData.branch = body.branch;
    if (body.status !== undefined) updateData.status = body.status;

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ user });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check for user management permission
    const canManage = await hasPermission('USER_CREATE');
    if (!canManage) {
      return NextResponse.json({ error: 'Permission denied: USER_CREATE required' }, { status: 403 });
    }

    // We prefer deactivation over hard deletion for audit purposes
    const user = await prisma.user.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
    });

    return NextResponse.json({ message: 'User deactivated successfully' });
  } catch (error: any) {
    console.error('Error deactivating user:', error);
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 });
  }
}
