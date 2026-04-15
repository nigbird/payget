import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

type MasterDataType = 'districts' | 'branches' | 'categories' | 'businessTypes';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      if (Array.isArray(value)) {
        return value.map(item =>
          typeof item === 'string' ? { name: item, active: true } : item
        ) as MasterDataEntry[];
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

interface MasterDataEntry {
  name: string;
  code?: string;
  active: boolean;
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, action, name, code, id, active } = body as {
      type: MasterDataType;
      action: 'add' | 'update' | 'delete' | 'toggle';
      name?: string;
      code?: string;
      id?: string;
      active?: boolean;
    };

    if (!type || !action) {
      return NextResponse.json({ error: 'Missing required fields: type and action' }, { status: 400 });
    }

    if (!['districts', 'branches', 'categories', 'businessTypes'].includes(type)) {
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
          resetTimeoutSeconds: 60,
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
    let updatedData: MasterDataEntry[];

    switch (action) {
      case 'add': {
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return NextResponse.json({ error: 'Name is required for add action' }, { status: 400 });
        }
        const trimmedName = name.trim();
        const existingEntry = currentData.find((entry) =>
          entry.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (existingEntry) {
          return NextResponse.json({ error: 'Entry already exists' }, { status: 409 });
        }
        const newEntry: MasterDataEntry = code
          ? { name: trimmedName, code: code.trim(), active: true }
          : { name: trimmedName, active: true };
        updatedData = [...currentData, newEntry];
        break;
      }
      case 'update': {
        if (!id && !name) {
          return NextResponse.json({ error: 'ID or name is required for update action' }, { status: 400 });
        }
        updatedData = currentData.map((entry, index) => {
          const matchesId = id && index === parseInt(id, 10);
          const matchesName = name && entry.name.toLowerCase() === name.trim().toLowerCase();
          if (matchesId || matchesName) {
            return {
              ...entry,
              name: name ? name.trim() : entry.name,
              code: code !== undefined ? (code ? code.trim() : entry.code || '') : entry.code || '',
              active: active !== undefined ? active : entry.active,
            };
          }
          return entry;
        });
        break;
      }
      case 'delete': {
        if (!id && !name) {
          return NextResponse.json({ error: 'ID or name is required for delete action' }, { status: 400 });
        }
        updatedData = currentData.filter((entry, index) => {
          const matchesId = id && index === parseInt(id, 10);
          const matchesName = name && entry.name.toLowerCase() === name.trim().toLowerCase();
          return !(matchesId || matchesName);
        });
        break;
      }
      case 'toggle': {
        if (!id && !name) {
          return NextResponse.json({ error: 'ID or name is required for toggle action' }, { status: 400 });
        }
        updatedData = currentData.map((entry, index) => {
          const matchesId = id && index === parseInt(id, 10);
          const matchesName = name && entry.name.toLowerCase() === name.trim().toLowerCase();
          if (matchesId || matchesName) {
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

    return NextResponse.json({
      success: true,
      [type]: updatedData,
    });
  } catch (error) {
    console.error('Error updating master data:', error);
    return NextResponse.json({ error: 'Failed to update master data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { type, entries } = body as {
      type: MasterDataType;
      entries: MasterDataEntry[];
    };

    if (!type || !entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!['districts', 'branches', 'categories', 'businessTypes'].includes(type)) {
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
          resetTimeoutSeconds: 60,
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
    const existingNames = new Set(currentData.map((entry) => entry.name.toLowerCase()));

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

    return NextResponse.json({
      success: true,
      imported: newEntries.length,
      skipped: skippedEntries,
      [type]: updatedData,
    });
  } catch (error) {
    console.error('Error bulk importing master data:', error);
    return NextResponse.json({ error: 'Failed to import master data' }, { status: 500 });
  }
}