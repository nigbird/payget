import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuthUser,
  userCanAssignPermissions,
  userHasPermission,
} from "@/lib/request-auth";
import { requireCsrf } from "@/lib/request-security";
import { writeAuditLog } from "@/lib/audit-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string | null = null;
  let roleId: string | null = null;

  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) {
      return csrfError
    }

    const user = await requireAuthUser(request);
    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "ADMIN_ROLE_UPDATE",
        entityType: "ROLE",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const canEditRole = userHasPermission(user, "ROLE_EDIT");
    if (!canEditRole) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_UPDATE",
        entityType: "ROLE",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "PERMISSION_DENIED_ROLE_EDIT",
        },
      });
      return NextResponse.json(
        { error: "Permission denied: ROLE_EDIT required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    roleId = id;

    const { name, description, permissionIds } = await request.json();

    const roleToEdit = await prisma.role.findUnique({
      where: { id },
    });

    if (!roleToEdit) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_UPDATE",
        entityType: "ROLE",
        entityId: id,
        newValue: { result: "failed", reason: "ROLE_NOT_FOUND" },
      });
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (
      roleToEdit.name === "Super Admin" &&
      !userHasPermission(user, "CONFIGURATION_MANAGE")
    ) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_UPDATE",
        entityType: "ROLE",
        entityId: id,
        newValue: {
          result: "failed",
          reason: "SUPER_ADMIN_PROTECTED",
        },
      });
      return NextResponse.json(
        {
          error:
            "Permission denied: Only Super Admins can edit the Super Admin role.",
        },
        { status: 403 }
      );
    }

    const targetPermissions = await prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { name: true },
    });
    const canAssign = userCanAssignPermissions(
      user,
      targetPermissions.map((p) => p.name)
    );
    if (!canAssign) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_UPDATE",
        entityType: "ROLE",
        entityId: id,
        newValue: {
          result: "failed",
          reason: "PRIVILEGE_ESCALATION",
        },
      });
      return NextResponse.json(
        {
          error:
            "Privilege escalation attempt: You cannot assign permissions you do not have.",
        },
        { status: 403 }
      );
    }

    const updatedRole = await prisma.role.update({
      where: { id },
      data: {
        name,
        description,
        permissions: {
          deleteMany: {},
          create: permissionIds.map((pid: string) => ({
            permissionId: pid,
          })),
        },
      },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_ROLE_UPDATE",
      entityType: "ROLE",
      entityId: id,
      oldValue: { name: roleToEdit.name, description: roleToEdit.description },
      newValue: { result: "success", name: updatedRole.name },
    });

    return NextResponse.json(updatedRole);
  } catch (error) {
    console.error("Error updating role:", error);

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_ROLE_UPDATE",
      entityType: "ROLE",
      entityId: roleId,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json(
      { error: "Failed to update role" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string | null = null;
  let roleId: string | null = null;

  try {
    const csrfError = await requireCsrf(request)
    if (csrfError) {
      return csrfError
    }

    const user = await requireAuthUser(request);
    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "ADMIN_ROLE_DELETE",
        entityType: "ROLE",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const canDeleteRole = userHasPermission(user, "ROLE_DELETE");
    if (!canDeleteRole) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_DELETE",
        entityType: "ROLE",
        entityId: null,
        newValue: {
          result: "failed",
          reason: "PERMISSION_DENIED_ROLE_DELETE",
        },
      });
      return NextResponse.json(
        { error: "Permission denied: ROLE_DELETE required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    roleId = id;

    const roleToDelete = await prisma.role.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true },
        },
      },
    });

    if (!roleToDelete) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_DELETE",
        entityType: "ROLE",
        entityId: id,
        newValue: { result: "failed", reason: "ROLE_NOT_FOUND" },
      });
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (
      roleToDelete.name === "Super Admin" ||
      roleToDelete.name === "Maker" ||
      roleToDelete.name === "Checker" ||
      roleToDelete.name === "HO Officer" ||
      roleToDelete.name === "Merchant"
    ) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_DELETE",
        entityType: "ROLE",
        entityId: id,
        newValue: { result: "failed", reason: "PROTECTED_SYSTEM_ROLE" },
      });
      return NextResponse.json(
        { error: "Cannot delete a protected system role." },
        { status: 403 }
      );
    }

    if (roleToDelete.users.length > 0) {
      await writeAuditLog({
        request,
        userId,
        action: "ADMIN_ROLE_DELETE",
        entityType: "ROLE",
        entityId: id,
        newValue: {
          result: "failed",
          reason: "ROLE_HAS_USERS",
          usersCount: roleToDelete.users.length,
        },
      });
      return NextResponse.json(
        {
          error: `Cannot delete role. There are ${roleToDelete.users.length} users assigned to this role.`,
        },
        { status: 400 }
      );
    }

    await prisma.role.delete({
      where: { id },
    });

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_ROLE_DELETE",
      entityType: "ROLE",
      entityId: id,
      oldValue: { name: roleToDelete.name },
      newValue: { result: "success" },
    });

    return NextResponse.json({ message: "Role deleted successfully" });
  } catch (error) {
    console.error("Error deleting role:", error);

    await writeAuditLog({
      request,
      userId,
      action: "ADMIN_ROLE_DELETE",
      entityType: "ROLE",
      entityId: roleId,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json(
      { error: "Failed to delete role" },
      { status: 500 }
    );
  }
}
