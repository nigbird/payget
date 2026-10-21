import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userCanAssignPermissions, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) {
      return csrfError
    }

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

    const oldUser = await prisma.user.findUnique({
      where: { id },
      include: { customRole: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!oldUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const deny = async (reason: string, message: string) => {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "ADMIN_USER_UPDATE",
        entityType: "USER",
        entityId: id,
        newValue: { result: "failed", reason },
      })
      return NextResponse.json({ error: message }, { status: 403 });
    }

    // Staff accounts only — merchant portal logins are managed by the merchant
    // onboarding and password-reset flows, not by back-office user management.
    if (oldUser.role === 'MERCHANT') {
      return deny("TARGET_IS_MERCHANT", "Merchant portal users can't be managed here.");
    }

    // You can only manage users whose permissions you hold yourself; otherwise a
    // limited user manager could demote, disable or re-email a super admin.
    const targetPerms = oldUser.customRole?.permissions.map((p) => p.permission.name) ?? [];
    if (!userCanAssignPermissions(authUser, targetPerms)) {
      return deny("TARGET_HAS_MORE_PERMISSIONS", "You cannot modify a user who has permissions you don't have.");
    }

    // Prepare update data
    const updateData: any = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    // The Users page sends customRoleId on every edit; only an actual change counts.
    if (body.customRoleId !== undefined && (body.customRoleId || null) !== oldUser.customRoleId) {
      if (id === actorUserId) {
        return deny("SELF_ROLE_CHANGE", "You cannot change your own role.");
      }
      if (!body.customRoleId) {
        return NextResponse.json({ error: 'A role is required' }, { status: 400 });
      }
      const targetRole = await prisma.role.findUnique({
        where: { id: body.customRoleId },
        include: { permissions: { include: { permission: true } } },
      });
      if (!targetRole) {
        return NextResponse.json({ error: 'Role not found' }, { status: 400 });
      }
      if (!userCanAssignPermissions(authUser, targetRole.permissions.map((p) => p.permission.name))) {
        return deny("PRIVILEGE_ESCALATION", "You cannot assign a role that has more permissions than you.");
      }
      updateData.customRoleId = body.customRoleId;
      updateData.sessionVersion = { increment: 1 };
    }
    if (body.isHeadOffice !== undefined) updateData.isHeadOffice = !!body.isHeadOffice;
    if (body.district !== undefined) updateData.district = body.district;
    if (body.branch !== undefined) updateData.branch = body.branch;
    if (body.status !== undefined) {
      if (id === actorUserId) {
        return deny("SELF_STATUS_CHANGE", "You cannot change your own status.");
      }
      if (body.status !== 'ACTIVE' && body.status !== 'DEACTIVATED') {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updateData.status = body.status;
      updateData.sessionVersion = { increment: 1 };
    }
    // Passwords are not set here: an admin-chosen password bypassed the password
    // policy and let a user manager take over any account. Users reset their own
    // password through the reset-password flow.
    if (body.password !== undefined) {
      return NextResponse.json({ error: 'Passwords cannot be set here. Use the password reset flow.' }, { status: 400 });
    }

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
      oldValue: oldUser ? {
        name: oldUser.name,
        email: oldUser.email,
        role: oldUser.role,
        status: oldUser.status,
      } : null,
      newValue: { 
        result: "success",
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, passwordResetToken: __, passwordResetExpires: ___, ...safeUser } = updatedUser;

    return NextResponse.json({ user: safeUser });
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
    const csrfError = await requireCsrf(request)
    if (csrfError) {
      return csrfError
    }

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
    const oldUser = await prisma.user.findUnique({
      where: { id },
      include: { customRole: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!oldUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Same boundaries as PATCH: not yourself, not merchant logins, and not
    // someone holding permissions you don't have.
    const targetPerms = oldUser.customRole?.permissions.map((p) => p.permission.name) ?? [];
    const denyReason =
      id === actorUserId ? "SELF_DEACTIVATE"
      : oldUser.role === 'MERCHANT' ? "TARGET_IS_MERCHANT"
      : !userCanAssignPermissions(authUser, targetPerms) ? "TARGET_HAS_MORE_PERMISSIONS"
      : null;
    if (denyReason) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "ADMIN_USER_DEACTIVATE",
        entityType: "USER",
        entityId: id,
        newValue: { result: "failed", reason: denyReason },
      })
      return NextResponse.json({ error: 'You cannot deactivate this user.' }, { status: 403 });
    }

    await prisma.user.update({
      where: { id },
      data: { 
        status: 'DEACTIVATED',
        sessionVersion: { increment: 1 } 
      },
    });

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "ADMIN_USER_DEACTIVATE",
      entityType: "USER",
      entityId: id,
      oldValue: oldUser ? {
        name: oldUser.name,
        email: oldUser.email,
        role: oldUser.role,
        status: oldUser.status,
      } : null,
      newValue: { 
        result: "success",
        name: oldUser?.name,
        email: oldUser?.email,
        newStatus: "DEACTIVATED",
      },
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
