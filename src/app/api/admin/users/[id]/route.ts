import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userHasPermission } from '@/lib/request-auth';
import { writeAuditLog } from '@/lib/audit-log';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuthUser(request);
    if (!authUser) {
      await writeAuditLog({
        request,
        userId: null,
        action: "ADMIN_USER_UPDATE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const actorUserId = authUser.id;
    // Check for user management permission
    const canManage = userHasPermission(authUser, 'USER_CREATE');
    if (!canManage) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "ADMIN_USER_UPDATE",
        entityType: "USER",
        entityId: id,
        newValue: { result: "failed", reason: "PERMISSION_DENIED_USER_CREATE" },
      })
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

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "ADMIN_USER_UPDATE",
      entityType: "USER",
      entityId: id,
      oldValue: null,
      newValue: { result: "success" },
    })

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    console.error('Error updating user:', error);
    await writeAuditLog({
      request,
      userId: null,
      action: "ADMIN_USER_UPDATE",
      entityType: "USER",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuthUser(request);
    if (!authUser) {
      await writeAuditLog({
        request,
        userId: null,
        action: "ADMIN_USER_DEACTIVATE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const actorUserId = authUser.id;
    // Check for user management permission
    const canManage = userHasPermission(authUser, 'USER_CREATE');
    if (!canManage) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "ADMIN_USER_DEACTIVATE",
        entityType: "USER",
        entityId: id,
        newValue: { result: "failed", reason: "PERMISSION_DENIED_USER_CREATE" },
      })
      return NextResponse.json({ error: 'Permission denied: USER_CREATE required' }, { status: 403 });
    }

    // We prefer deactivation over hard deletion for audit purposes
    await prisma.user.update({
      where: { id },
      data: { status: 'DEACTIVATED' },
    });

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "ADMIN_USER_DEACTIVATE",
      entityType: "USER",
      entityId: id,
      oldValue: null,
      newValue: { result: "success" },
    })

    return NextResponse.json({ message: 'User deactivated successfully' });
  } catch (error: any) {
    console.error('Error deactivating user:', error);
    await writeAuditLog({
      request,
      userId: null,
      action: "ADMIN_USER_DEACTIVATE",
      entityType: "USER",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    })
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 });
  }
}
