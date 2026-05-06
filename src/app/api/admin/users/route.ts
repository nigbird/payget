import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { requireAuthUser, userCanAssignPermissions, userHasPermission } from '@/lib/request-auth';
import { requireCsrf } from '@/lib/request-security';
import { writeAuditLog } from '@/lib/audit-log';

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canViewUsers = userHasPermission(user, 'USER_CREATE');
    if (!canViewUsers) {
      return NextResponse.json({ error: 'Permission denied: USER_CREATE required' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        customRoleId: true,
        merchantId: true,
        isHeadOffice: true,
        district: true,
        branch: true,
        status: true,
        createdAt: true,
        customRole: {
          select: {
            id: true,
            name: true,
            permissions: {
              include: {
                permission: true
              }
            }
          }
        },
        merchant: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });

    return NextResponse.json({ users, roles });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let userId: string | null = null;
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
        action: "ADMIN_USER_CREATE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = authUser.id;

    const canCreateUser = userHasPermission(authUser, 'USER_CREATE');
    if (!canCreateUser) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_USER_CREATE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "PERMISSION_DENIED_USER_CREATE" },
      });
      return NextResponse.json({ error: 'Permission denied: USER_CREATE required' }, { status: 403 });
    }

    const { 
      email, 
      name, 
      password, 
      customRoleId, 
      role: legacyRole, 
      merchantId,
      isHeadOffice,
      district,
      branch
    } = await request.json();

    // Enforce boundary: Admin management users (those with custom roles) 
    // must NOT be tied to a specific merchant.
    let finalMerchantId = merchantId;
    if (customRoleId) {
      finalMerchantId = null;
    }

    // Privilege escalation check: cannot assign a role with permissions you don't have
    if (customRoleId) {
      const targetRole = await prisma.role.findUnique({
        where: { id: customRoleId },
        include: { permissions: { include: { permission: true } } }
      });

      if (targetRole) {
        const targetPerms = targetRole.permissions.map(p => p.permission.name);
        const canAssign = userCanAssignPermissions(authUser, targetPerms);
        if (!canAssign) {
          await writeAuditLog({
            request,
            userId,
            action: "ADMIN_USER_CREATE",
            entityType: "USER",
            entityId: null,
            newValue: { result: "failed", reason: "PRIVILEGE_ESCALATION" },
          });
          return NextResponse.json({ 
            error: 'Privilege escalation attempt: You cannot assign a role that has more permissions than you.' 
          }, { status: 403 });
        }
      }
    }

    if (!password) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_USER_CREATE",
        entityType: "USER",
        entityId: null,
        newValue: { result: "failed", reason: "PASSWORD_REQUIRED" },
      });
      return NextResponse.json({ error: 'Password is required to create a user.' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const createdUser = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        customRoleId,
        role: legacyRole || (customRoleId ? 'ADMIN' : 'MERCHANT'),
        merchantId: finalMerchantId,
        isHeadOffice: !!isHeadOffice,
        district: isHeadOffice ? null : district,
        branch: isHeadOffice ? null : branch
      },
      include: {
        customRole: true
      }
    });

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_USER_CREATE",
      entityType: "USER",
      entityId: createdUser.id,
      newValue: { result: "success", email: createdUser.email, name: createdUser.name, role: createdUser.role },
    });

    return NextResponse.json(createdUser, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_USER_CREATE",
      entityType: "USER",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
