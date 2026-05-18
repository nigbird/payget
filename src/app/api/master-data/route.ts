import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthUser } from '@/lib/request-auth';
import { writeAuditLog } from '@/lib/audit-log';
import { requireCsrf } from '@/lib/request-security';

type MasterDataType = 'districts' | 'branches' | 'categories' | 'businessTypes';

interface MasterDataEntry {
  name: string;
  code?: string;
  active: boolean;
  district?: string; // For branches
}

export async function GET() {
  try {
    const config = await prisma.systemConfig.findFirst();
    if (!config) {
      return NextResponse.json({
        districts: [],
        branches: [],
        categories: [],
        businessTypes: [],
      });
    }

    const parseField = (value: unknown): MasterDataEntry[] => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed.map(item => {
              if (typeof item === 'string') return { name: item, active: true };
              if (item && typeof item === 'object') {
                return {
                  name: String(item.name || ''),
                  code: item.code ? String(item.code) : undefined,
                  active: item.active !== undefined ? Boolean(item.active) : true,
                  district: item.district ? String(item.district) : undefined
                };
              }
              return { name: 'Unknown', active: false };
            }) as MasterDataEntry[];
          }
        } catch (e) {
          console.error("Failed to parse JSON field:", e);
        }
      } else if (Array.isArray(value)) {
        return value.map(item => {
          if (typeof item === 'string') return { name: item, active: true };
          if (item && typeof item === 'object') {
            return {
              name: String(item.name || ''),
              code: item.code ? String(item.code) : undefined,
              active: item.active !== undefined ? Boolean(item.active) : true,
              district: item.district ? String(item.district) : undefined
            };
          }
          return { name: 'Unknown', active: false };
        }) as MasterDataEntry[];
      }
      return [];
    };

    return NextResponse.json({
      districts: parseField(config.districts),
      branches: parseField(config.branches),
      categories: parseField(config.categories),
      businessTypes: parseField(config.businessTypes),
    });
  } catch (error) {
    console.error('Error fetching master data:', error);
    return NextResponse.json({ error: 'Failed to fetch master data' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    const actorUserId = user?.id ?? null;

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "MASTER_DATA_UPDATE",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, action, name, code, id, active, district } = body as {
      type: MasterDataType;
      action: 'add' | 'update' | 'delete' | 'toggle';
      name?: string;
      code?: string;
      id?: string;
      active?: boolean;
      district?: string;
    };

    if (!type || !action) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MASTER_DATA_UPDATE",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "MISSING_TYPE_OR_ACTION" },
      });

      return NextResponse.json({ error: 'Missing required fields: type and action' }, { status: 400 });
    }

    if (!['districts', 'branches', 'categories', 'businessTypes'].includes(type)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MASTER_DATA_UPDATE",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_MASTER_DATA_TYPE", type },
      });

      return NextResponse.json({ error: 'Invalid master data type' }, { status: 400 });
    }

    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          id: '1',
          districts: '[]',
          branches: '[]',
          categories: '[]',
          businessTypes: '[]',
          allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
          maxFileSizeMB: 5,
          resetTimeoutSeconds: 300,
        },
      });
    }

    const parseField = (value: unknown): MasterDataEntry[] => {
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) {
            return parsed.map(item => {
              if (typeof item === 'string') return { name: item, active: true };
              if (item && typeof item === 'object') {
                return {
                  name: String(item.name || ''),
                  code: item.code ? String(item.code) : undefined,
                  active: item.active !== undefined ? Boolean(item.active) : true,
                  district: item.district ? String(item.district) : undefined
                };
              }
              return { name: 'Unknown', active: false };
            }) as MasterDataEntry[];
          }
        } catch { return []; }
      }
      if (Array.isArray(value)) {
        return value.map(item => {
          if (typeof item === 'string') return { name: item, active: true };
          if (item && typeof item === 'object') {
            return {
              name: String(item.name || ''),
              code: item.code ? String(item.code) : undefined,
              active: item.active !== undefined ? Boolean(item.active) : true,
              district: item.district ? String(item.district) : undefined
            };
          }
          return { name: 'Unknown', active: false };
        }) as MasterDataEntry[];
      }
      return [];
    };

    const currentData = parseField((config as any)[type]);
    let updatedData: MasterDataEntry[];

    switch (action) {
      case 'add': {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return NextResponse.json({ error: 'Name is required for add action' }, { status: 400 });
        }
        const trimmedName = name.trim();
        const existingEntry = currentData.find((entry) =>
          entry.name && entry.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (existingEntry) {
          return NextResponse.json({ error: 'Entry already exists' }, { status: 409 });
        }
        const newEntry: MasterDataEntry = {
          name: trimmedName,
          code: code ? code.trim() : undefined,
          active: true,
          district: type === 'branches' ? district : undefined
        };
        updatedData = [...currentData, newEntry];
        break;
      }
      case 'update': {
        if (id === undefined) {
          return NextResponse.json({ error: 'ID is required for update action' }, { status: 400 });
        }
        updatedData = currentData.map((entry, index) => {
          if (index === parseInt(id, 10)) {
            return {
              ...entry,
              name: name !== undefined ? name.trim() : entry.name,
              code: code !== undefined ? (code ? code.trim() : undefined) : entry.code,
              active: active !== undefined ? active : entry.active,
              district: (type === 'branches' && district !== undefined) ? district : entry.district
            };
          }
          return entry;
        });
        break;
      }
      case 'delete': {
        if (id === undefined) {
          return NextResponse.json({ error: 'ID is required for delete action' }, { status: 400 });
        }
        updatedData = currentData.filter((entry, index) => index !== parseInt(id, 10));
        break;
      }
      case 'toggle': {
        if (id === undefined) {
          return NextResponse.json({ error: 'ID is required for toggle action' }, { status: 400 });
        }
        updatedData = currentData.map((entry, index) => {
          if (index === parseInt(id, 10)) {
            return { ...entry, active: active !== undefined ? active : !entry.active };
          }
          return entry;
        });
        break;
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const updatedConfig = await prisma.systemConfig.update({
      where: { id: config.id },
      data: { [type]: JSON.stringify(updatedData) },
    });

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MASTER_DATA_UPDATE",
      entityType: "SYSTEM_CONFIG",
      entityId: null,
      oldValue: null,
      newValue: {
        result: "success",
        type,
        operation: action,
        updatedCount: updatedData?.length ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      [type]: updatedData,
    });
  } catch (error) {
    console.error('Error updating master data:', error);

    await writeAuditLog({
      request,
      userId: null,
      action: "MASTER_DATA_UPDATE",
      entityType: "SYSTEM_CONFIG",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Failed to update master data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const csrfError = await requireCsrf(request);
    if (csrfError) return csrfError;

    const user = await requireAuthUser(request);
    const actorUserId = user?.id ?? null;

    if (!user) {
      await writeAuditLog({
        request,
        userId: null,
        action: "MASTER_DATA_BULK_IMPORT",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "UNAUTHORIZED" },
      });

      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, entries } = body as {
      type: MasterDataType;
      entries: MasterDataEntry[];
    };

    if (!type || !entries || !Array.isArray(entries)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MASTER_DATA_BULK_IMPORT",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_REQUEST_BODY" },
      });

      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!['districts', 'branches', 'categories', 'businessTypes'].includes(type)) {
      await writeAuditLog({
        request,
        userId: actorUserId,
        action: "MASTER_DATA_BULK_IMPORT",
        entityType: "SYSTEM_CONFIG",
        entityId: null,
        newValue: { result: "failed", reason: "INVALID_MASTER_DATA_TYPE", type },
      });

      return NextResponse.json({ error: 'Invalid master data type' }, { status: 400 });
    }

    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          id: '1',
          districts: '[]',
          branches: '[]',
          categories: '[]',
          businessTypes: '[]',
          allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
          maxFileSizeMB: 5,
          resetTimeoutSeconds: 300,
        },
      });
    }

    const parseField = (value: unknown): MasterDataEntry[] => {
      if (Array.isArray(value)) {
        return value as MasterDataEntry[];
      }
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return [];
        }
      }
      return [];
    };

    const currentData = parseField((config as any)[type]);
    const existingNames = new Set(
      currentData
        .filter((entry): entry is MasterDataEntry => typeof entry?.name === 'string' && entry.name.trim().length > 0)
        .map((entry) => entry.name.toLowerCase())
    );

    const newEntries: MasterDataEntry[] = [];
    const skippedEntries: { name: string; reason: string }[] = [];

    for (const entry of entries) {
      if (!entry.name || typeof entry.name !== 'string' || entry.name.trim().length === 0) {
        skippedEntries.push({ name: entry.name || '(empty)', reason: 'Missing name' });
        continue;
      }
      const trimmedName = entry.name.trim();
      if (existingNames.has(trimmedName.toLowerCase())) {
        skippedEntries.push({ name: trimmedName, reason: 'Already exists' });
        continue;
      }
      existingNames.add(trimmedName.toLowerCase());
      newEntries.push({
        name: trimmedName,
        code: entry.code ? entry.code.trim() : '',
        active: entry.active !== undefined ? entry.active : true,
      });
    }

    const updatedData = [...currentData, ...newEntries];
    const updatedConfig = await prisma.systemConfig.update({
      where: { id: config.id },
      data: { [type]: JSON.stringify(updatedData) },
    });

    await writeAuditLog({
      request,
      userId: actorUserId,
      action: "MASTER_DATA_BULK_IMPORT",
      entityType: "SYSTEM_CONFIG",
      entityId: null,
      oldValue: null,
      newValue: {
        result: "success",
        type,
        imported: newEntries.length,
        skipped: skippedEntries.length,
      },
    });

    return NextResponse.json({
      success: true,
      imported: newEntries.length,
      skipped: skippedEntries,
      [type]: updatedData,
    });
  } catch (error) {
    console.error('Error bulk importing master data:', error);

    await writeAuditLog({
      request,
      userId: null,
      action: "MASTER_DATA_BULK_IMPORT",
      entityType: "SYSTEM_CONFIG",
      entityId: null,
      newValue: { result: "failed", reason: "INTERNAL_ERROR" },
    });

    return NextResponse.json({ error: 'Failed to import master data' }, { status: 500 });
  }
}
