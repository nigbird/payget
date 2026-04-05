import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { hasPermission, canAssignPermissions, isSuperAdmin } from '@/lib/rbac';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canEditRole = await hasPermission('ROLE_EDIT');
    if (!canEditRole) {
      return NextResponse.json({ error: 'Permission denied: ROLE_EDIT required' }, { status: 403 });
    }

    const { id } = await params;
    const { name, description, permissionIds } = await request.json();

    // Check if the role is a protected system role (e.g., "Super Admin")
    // Super Admins can edit anything, but others shouldn't be able to edit the Super Admin role.
    const roleToEdit = await prisma.role.findUnique({
      where: { id },
    });

    if (!roleToEdit) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    if (roleToEdit.name === 'Super Admin' && !(await isSuperAdmin())) {
      return NextResponse.json({ error: 'Permission denied: Only Super Admins can edit the Super Admin role.' }, { status: 403 });
    }

    // Privilege escalation check
    const canAssign = await canAssignPermissions(permissionIds);
    if (!canAssign) {
      return NextResponse.json({ 
        error: 'Privilege escalation attempt: You cannot assign permissions you do not have.' 
      }, { status: 403 });
    }

    const updatedRole = await prisma.role.update({
      where: { id },
      data: {
        name,
        description,
        permissions: {
          deleteMany: {},
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

    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error('Error updating role:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
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

    const canDeleteRole = await hasPermission('ROLE_DELETE');
    if (!canDeleteRole) {
      return NextResponse.json({ error: 'Permission denied: ROLE_DELETE required' }, { status: 403 });
    }

    const { id } = await params;

    const roleToDelete = await prisma.role.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true }
        }
      }
    });

    if (!roleToDelete) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Check if the role is a protected system role
    if (roleToDelete.name === 'Super Admin' || roleToDelete.name === 'Maker' || roleToDelete.name === 'Checker' || roleToDelete.name === 'HO Officer' || roleToDelete.name === 'Merchant') {
      return NextResponse.json({ error: 'Cannot delete a protected system role.' }, { status: 403 });
    }

    // Check if any users are assigned to this role
    if (roleToDelete.users.length > 0) {
      return NextResponse.json({ 
        error: `Cannot delete role. There are ${roleToDelete.users.length} users assigned to this role.` 
      }, { status: 400 });
    }

    await prisma.role.delete({
      where: { id }
    });

    return NextResponse.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    return NextResponse.json({ error: 'Failed to delete role' }, { status: 500 });
  }
}
