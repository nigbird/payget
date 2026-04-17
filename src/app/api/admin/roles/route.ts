import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser, userCanAssignPermissions, userHasPermission } from '@/lib/request-auth';

export async function GET(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const roles = await prisma.role.findMany({
      include: {
        permissions: {
          include: {
            permission: true
          }
        },
        users: {
          select: { id: true }
        }
      }
    });

    const permissions = await prisma.permission.findMany();

    return NextResponse.json({ roles, permissions });
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({ error: 'Failed to fetch roles' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canCreateRole = userHasPermission(user, 'ROLE_CREATE');
    if (!canCreateRole) {
      return NextResponse.json({ error: 'Permission denied: ROLE_CREATE required' }, { status: 403 });
    }

    const { name, description, permissionIds } = await request.json();

    // Privilege escalation check
    const canAssign = userCanAssignPermissions(user, permissionIds);
    if (!canAssign) {
      return NextResponse.json({ 
        error: 'Privilege escalation attempt: You cannot assign permissions you do not have.' 
      }, { status: 403 });
    }

    const role = await prisma.role.create({
      data: {
        name,
        description,
        createdBy: user.id,
        permissions: {
          create: permissionIds.map((pid: string) => ({
            permissionId: pid
          }))
        }
      },
      include: {
        permissions: {
          include: {
            permission: true
          }
        }
      }
    });

    return NextResponse.json(role, { status: 201 });
  } catch (error) {
    console.error('Error creating role:', error);
    return NextResponse.json({ error: 'Failed to create role' }, { status: 500 });
  }
}
