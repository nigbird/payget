import { prisma } from '@/lib/prisma';
import {
  MerchantStatus as PrismaMerchantStatus,
  TransactionStatus as PrismaTransactionStatus,
  TeamRole,
  Merchant as PrismaMerchant,
  Transaction as PrismaTransaction,
  TransactionItem as PrismaTransactionItem,
  OrderPrintInfo as PrismaOrderPrintInfo,
  MerchantDocument as PrismaMerchantDocument,
  User as PrismaUser,
  UserRole
} from '@prisma/client';

export type MerchantStatus = 'pending' | 'branch_approved' | 'approved' | 'rejected' | 'active' | 'rejected_with_update' | 'resubmitted';
export type TransactionStatus = 'success' | 'failed' | 'initiated' | 'pending' | 'awaiting_pin' | 'processing';
export type PaymentMethod = 'BANK' | 'TELEBIRR';

export interface MerchantDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  uploadedAt: string;
}

export interface MerchantUpdateToken {
  id: string;
  token: string;
  merchantId: string;
  otp?: string | null;
  otpExpires?: string | null;
  verified: boolean;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
}

export interface Merchant {
  id: string;
  name: string;
  email: string;
  password?: string | null;
  logoUrl?: string | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: string | null;
  jweSecret: string;
  accountNumber: string;
  dailyLimit: number;
  transactionLimit: number;
  dailyCountLimit: number;
  status: MerchantStatus;
  rejectionReason?: string | null;
  businessDescription?: string | null;
  websiteUrl?: string | null;
  callbackUrl?: string | null;
  contactName: string;
  contactUsername: string;
  branchName: string;
  district: string;
  category: string;
  businessType: string;
  riskFactors: string[];
  createdBy?: string | null;
  limitsSetBy?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  updateComments?: any | null;
  documents?: MerchantDocument[];
  _count?: {
    transactions: number;
  };
}

/** Snapshot of a catalog item as it was at checkout time; see the TransactionItem Prisma model. */
export interface TransactionItemLine {
  id: string;
  itemId: string | null;
  name: string;
  price: number;
  quantity: number;
  categoryName: string | null;
  mainCategoryName: string | null;
}

/** Item line to persist when creating a transaction; passed separately to db.addTransaction. */
export interface TransactionItemInput {
  itemId?: string | null;
  name: string;
  price: number;
  quantity: number;
  categoryName?: string | null;
  mainCategoryName?: string | null;
}

/** Print-specific metadata for an order's kitchen/bar tickets; see the OrderPrintInfo Prisma model. */
export interface OrderPrintInfo {
  tableNo: string | null;
  shift: string | null;
}

export interface Transaction {
  id: string;
  merchantId: string;
  amount: number;
  status: TransactionStatus;
  callbackUrl: string;
  description: string;
  timestamp: string;
  payerPhone?: string | null;
  payerAccount?: string | null;
  transactionReference: string;
  serviceDescription: string;
  transactionTimestamp: string;
  /** Core-banking FT / receipt number, once the payment has been resolved. */
  cbsreference?: string | null;
  /** Only populated when explicitly included (e.g. getTransactionsByMerchant). */
  items?: TransactionItemLine[];
  /** Only populated when explicitly included (e.g. getTransactionsByMerchant). Null until a merchant edits table/shift for this order's print ticket. */
  printInfo?: OrderPrintInfo | null;
  userCredentials: {
    phone: string;
    authToken: string;
    initiatedById?: string;
    initiatedByName?: string;
    providerSharedSecret?: string;
    previousTransactionReferences?: string[];
    cbsreference?: string;
    link?: {
      expiresAt: string;
      status: 'PENDING' | 'USED' | 'EXPIRED';
      usedAt?: string;
    };
  };
  paymentMethod: PaymentMethod;
}

function mapMerchantStatus(s: PrismaMerchantStatus): MerchantStatus {
  if (s === 'PENDING') return 'pending';
  if (s === 'BRANCH_APPROVED') return 'branch_approved';
  if (s === 'APPROVED') return 'approved';
  if (s === 'ACTIVE') return 'active';
  if (s === 'REJECTED_WITH_UPDATE') return 'rejected_with_update';
  if (s === 'RESUBMITTED') return 'resubmitted';
  return 'rejected';
}

function mapToPrismaMerchantStatus(s: MerchantStatus): PrismaMerchantStatus {
  if (s === 'pending') return 'PENDING';
  if (s === 'branch_approved') return 'BRANCH_APPROVED';
  if (s === 'approved') return 'APPROVED';
  if (s === 'active') return 'ACTIVE';
  if (s === 'rejected_with_update') return 'REJECTED_WITH_UPDATE';
  if (s === 'resubmitted') return 'RESUBMITTED';
  return 'REJECTED';
}

function mapTransactionStatus(s: PrismaTransactionStatus): TransactionStatus {
  return s.toLowerCase() as TransactionStatus;
}

function mapToPrismaTransactionStatus(s: TransactionStatus): PrismaTransactionStatus {
  return s.toUpperCase() as PrismaTransactionStatus;
}

function mapMerchant(
  m: PrismaMerchant & { documents?: PrismaMerchantDocument[], _count?: { transactions: number } },
  options?: { includeSecret?: boolean }
): Merchant {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, passwordResetToken, passwordResetExpires, jweSecret, ...safeMerchant } = m;

  return {
    ...safeMerchant,
    jweSecret: options?.includeSecret ? m.jweSecret : "",
    status: mapMerchantStatus(m.status),
    createdAt: m.createdAt.toISOString(),
    passwordResetExpires: (m as any).passwordResetExpires ? (m as any).passwordResetExpires.toISOString() : null,
    createdBy: m.createdBy,
    logoUrl: (m as any).logoUrl ?? null,
    limitsSetBy: (m as any).limitsSetBy ?? null,
    approvedBy: m.approvedBy,
    documents: m.documents?.map(doc => ({
      ...doc,
      uploadedAt: doc.uploadedAt.toISOString()
    })),
    _count: m._count
  } as any;
}

function mapTransaction(
  tx: PrismaTransaction & { items?: PrismaTransactionItem[]; printInfo?: PrismaOrderPrintInfo | null }
): Transaction {
  return {
    ...tx,
    payerPhone: tx.payerPhone ?? undefined,
    payerAccount: tx.payerAccount ?? undefined,
    status: mapTransactionStatus(tx.status),
    timestamp: tx.timestamp.toISOString(),
    transactionTimestamp: tx.transactionTimestamp.toISOString(),
    userCredentials: tx.userCredentials as {
      phone: string;
      authToken: string;
      initiatedById?: string;
      initiatedByName?: string;
      providerSharedSecret?: string;
      previousTransactionReferences?: string[];
      cbsreference?: string;
      link?: {
        expiresAt: string;
        status: 'PENDING' | 'USED' | 'EXPIRED';
        usedAt?: string;
      };
    },
    paymentMethod: tx.paymentMethod as PaymentMethod,
    items: tx.items?.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
      categoryName: i.categoryName,
      mainCategoryName: i.mainCategoryName,
    })),
    printInfo: tx.printInfo === undefined
      ? undefined
      : tx.printInfo
        ? { tableNo: tx.printInfo.tableNo, shift: tx.printInfo.shift }
        : null,
  };
}

export function sanitizeTransaction(tx: Transaction) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { providerSharedSecret, authToken, ...safeCredentials } = tx.userCredentials;
  return { ...tx, userCredentials: safeCredentials };
}

export type MerchantTeamRole = 'payment_initiator' | 'account_admin' | 'sales_admin';
export type MerchantTeamMemberStatus = 'active' | 'deactivated';

export interface MerchantTeamMember {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  phone?: string;
  otp?: string | null;
  otpExpires?: string | null;
  role: MerchantTeamRole;
  status: MerchantTeamMemberStatus;
  createdAt: string;
  /** When team member email matches a User on this merchant, that user's id (for transaction initiator matching). */
  linkedUserId?: string | null;
}

function mapTeamRole(r: TeamRole): MerchantTeamRole {
  return r.toLowerCase() as MerchantTeamRole;
}

function mapToPrismaTeamRole(r: MerchantTeamRole): TeamRole {
  return r.toUpperCase() as TeamRole;
}

function mapTeamMemberStatus(s: any): MerchantTeamMemberStatus {
  return s.toLowerCase() as MerchantTeamMemberStatus;
}

function mapToPrismaTeamMemberStatus(s: MerchantTeamMemberStatus): any {
  return s.toUpperCase();
}

function mapTeamMember(tm: any): MerchantTeamMember {
  return {
    ...tm,
    role: mapTeamRole(tm.role),
    status: mapTeamMemberStatus(tm.status),
    createdAt: tm.createdAt.toISOString(),
    otp: tm.otp ?? undefined,
    otpExpires: tm.otpExpires ? tm.otpExpires.toISOString() : undefined
  };
}

export const db = {
  // User Auth Methods
  findUserByEmail: async (email: string) => {
    return prisma.user.findUnique({
      where: { email },
      include: {
        merchant: true,
        customRole: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });
  },

  getUserByEmailOrPhone: async (identifier: string) => {
    return prisma.user.findFirst({
      where: {
        email: identifier
      }
    });
  },

  findMerchantUserByMerchantId: async (merchantId: string) => {
    return prisma.user.findFirst({
      where: { merchantId, role: UserRole.MERCHANT },
      include: {
        merchant: true,
        customRole: {
          include: {
            permissions: {
              include: {
                permission: true
              }
            }
          }
        }
      }
    });
  },

  findMerchantTeamMembersByPhone: async (phone: string) => {
    return prisma.merchantTeamMember.findMany({
      where: { phone },
      include: {
        merchant: true
      }
    })
  },

  getAssignedMerchantsForSalesPhone: async (phone: string) => {
    const members = await prisma.merchantTeamMember.findMany({
      where: {
        phone,
        status: 'ACTIVE',
        merchant: {
          status: 'ACTIVE'
        }
      },
      include: {
        merchant: true
      }
    }) as any[]

    return members
      .filter((member) => member.merchant)
      .map((member) => ({ id: member.merchantId, name: member.merchant.name }))
  },

  getMerchantTeamMembersByMerchantId: async (merchantId: string) => {
    const members = await prisma.merchantTeamMember.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' }
    });
    return members.map(mapTeamMember);
  },

  setMerchantTeamMemberOtpByPhone: async (phone: string, otp: string, expiresAt: Date) => {
    return prisma.merchantTeamMember.updateMany({
      where: {
        phone,
        status: 'ACTIVE',
        merchant: {
          status: 'ACTIVE'
        }
      },
      data: { otp, otpExpires: expiresAt }
    });
  },

  verifyMerchantTeamMemberOtp: async (phone: string, code: string) => {
    const member = await prisma.merchantTeamMember.findFirst({
      where: {
        phone,
        otp: code,
        otpExpires: { gte: new Date() },
        status: 'ACTIVE',
        merchant: {
          status: 'ACTIVE'
        }
      }
    });

    if (!member) {
      return false;
    }

    await prisma.merchantTeamMember.updateMany({
      where: {
        phone,
        otp: code,
        merchant: {
          status: 'ACTIVE'
        }
      },
      data: { otp: null, otpExpires: null }
    });

    return true;
  },

  addMerchantTeamMember: async (data: any) => {
    const { merchantId, email, phone } = data;

    const whereConditions: any[] = [];
    if (email) {
      whereConditions.push({ merchantId, email });
    }
    if (phone) {
      whereConditions.push({ merchantId, phone });
    }

    if (whereConditions.length > 0) {
      const existing = await prisma.merchantTeamMember.findFirst({
        where: {
          OR: whereConditions
        }
      });

      if (existing) {
        const duplicateField = existing.email === email ? 'email' : 'phone';
        throw new Error(`A team member with this ${duplicateField} already exists for this merchant.`);
      }
    }

    return prisma.merchantTeamMember.create({
      data: {
        ...data,
        role: mapToPrismaTeamRole(data.role),
        status: data.status ? mapToPrismaTeamMemberStatus(data.status) : 'ACTIVE'
      }
    });
  },

  updateMerchantTeamMember: async (id: string, data: any) => {
    if (data.role) data.role = mapToPrismaTeamRole(data.role);
    if (data.status) data.status = mapToPrismaTeamMemberStatus(data.status);
    return prisma.merchantTeamMember.update({
      where: { id },
      data
    });
  },

  setMerchantTeamMemberActive: async (id: string, active: boolean) => {
    return prisma.merchantTeamMember.update({
      where: { id },
      data: { status: active ? 'ACTIVE' : 'DEACTIVATED' }
    });
  },

  getMerchants: async () => {
    const merchants = await prisma.merchant.findMany({
      include: { 
        documents: true,
        _count: {
          select: { transactions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return merchants.map((m) => mapMerchant(m));
  },
  
  getMerchantById: async (id: string, options?: { includeSecret?: boolean }) => {
    const m = await prisma.merchant.findUnique({
      where: { id },
      include: {
        documents: true,
        _count: {
          select: { transactions: true }
        }
      }
    });
    if (!m) return null;
    return mapMerchant(m, options);
  },

  /** Same as getMerchantById but skips the documents/transaction-count joins — for hot paths (e.g. payment initiation) that never read those fields. */
  getMerchantByIdLean: async (id: string, options?: { includeSecret?: boolean }) => {
    const m = await prisma.merchant.findUnique({ where: { id } });
    if (!m) return null;
    return mapMerchant(m, options);
  },

  findMerchantByIdentifier: async (identifier: string, options?: { includeSecret?: boolean }) => {
    const m = await prisma.merchant.findFirst({
      where: {
        OR: [
          { id: identifier },
          { email: identifier },
          { contactUsername: identifier }
        ]
      },
      include: { documents: true }
    });
    if (!m) return null;
    return mapMerchant(m, options);
  },

  findMerchantByResetToken: async (token: string, options?: { includeSecret?: boolean }) => {
    const m = await prisma.merchant.findFirst({
      where: { passwordResetToken: token },
      include: { documents: true }
    }) as any
    if (!m) return null
    return mapMerchant(m, options)
  },

  addMerchant: async (data: any) => {
    const { documents, ...rest } = data;
    return prisma.merchant.create({
      data: {
        ...rest,
        status: rest.status ? mapToPrismaMerchantStatus(rest.status) : 'PENDING',
        documents: documents ? {
          create: documents.map((doc: any) => ({
            id: doc.id,
            name: doc.name,
            type: doc.type,
            size: doc.size,
            uploadedAt: new Date(doc.uploadedAt)
          }))
        } : undefined
      }
    });
  },

  updateMerchant: async (id: string, data: any) => {
    if (data.status) {
      data.status = mapToPrismaMerchantStatus(data.status);
    }
    if (typeof data.passwordResetExpires === 'string') {
      data.passwordResetExpires = new Date(data.passwordResetExpires)
    }
    const { documents, ...rest } = data;
    const m = await prisma.merchant.update({
      where: { id },
      data: rest,
      include: {
        documents: true,
        _count: {
          select: { transactions: true }
        }
      }
    });
    return mapMerchant(m);
  },

  getTransactions: async (filters?: { 
    merchantId?: string; 
    merchantIds?: string[];
    status?: TransactionStatus;
    phone?: string;
    initiatedById?: string;
    minTimestamp?: Date;
    maxTimestamp?: Date;
    limit?: number;
    transactionReference?: string;
  }) => {
    const where: any = {};
    
    if (filters?.merchantId) {
      where.merchantId = filters.merchantId;
    } else if (filters?.merchantIds && filters.merchantIds.length > 0) {
      where.merchantId = { in: filters.merchantIds };
    }
    
    if (filters?.status) {
      where.status = mapToPrismaTransactionStatus(filters.status);
    }

    if (filters?.transactionReference) {
      where.transactionReference = filters.transactionReference;
    }
    
    if (filters?.phone) {
      where.OR = [
        { payerPhone: filters.phone },
        { userCredentials: { path: ['phone'], equals: filters.phone } }
      ];
    }
    
    if (filters?.initiatedById) {
      where.userCredentials = { 
        ...(where.userCredentials || {}),
        path: ['initiatedById'], 
        equals: filters.initiatedById 
      };
    }

    if (filters?.minTimestamp || filters?.maxTimestamp) {
      where.timestamp = {};
      if (filters.minTimestamp) where.timestamp.gte = filters.minTimestamp;
      if (filters.maxTimestamp) where.timestamp.lte = filters.maxTimestamp;
    }

    const txs = await prisma.transaction.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters?.limit
    });
    return txs.map(mapTransaction);
  },

  getTransactionsByMerchant: async (merchantId: string) => {
    const txs = await prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { timestamp: 'desc' },
      include: { items: true, printInfo: true }
    });
    return txs.map(mapTransaction);
  },

  /** Sum/count of a merchant's successful transactions since `since`, for daily-limit checks. */
  getMerchantSuccessStatsSince: async (merchantId: string, since: Date) => {
    const result = await prisma.transaction.aggregate({
      where: { merchantId, status: 'SUCCESS', timestamp: { gte: since } },
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { totalAmount: result._sum.amount ?? 0, count: result._count._all };
  },

  getTransactionById: async (id: string) => {
    const tx = await prisma.transaction.findUnique({
      where: { id }
    });
    if (!tx) return null;
    return mapTransaction(tx);
  },

  getTransactionByReference: async (transactionReference: string) => {
    const tx = await prisma.transaction.findFirst({
      where: { transactionReference }
    });
    if (!tx) return null;
    return mapTransaction(tx);
  },

  /** Resolve a transaction by its core-banking FT / receipt number. */
  getTransactionByCbsReference: async (cbsreference: string) => {
    const tx = await prisma.transaction.findUnique({
      where: { cbsreference }
    });
    if (!tx) return null;
    return mapTransaction(tx);
  },

  /** Resolve by current reference or a previous reference after resend-push. */
  getTransactionByProviderReference: async (reference: string) => {
    const direct = await prisma.transaction.findFirst({
      where: { transactionReference: reference },
    });
    if (direct) return mapTransaction(direct);

    const rows = await prisma.$queryRaw<PrismaTransaction[]>`
      SELECT * FROM "Transaction"
      WHERE ("userCredentials"->'previousTransactionReferences') @> to_jsonb(ARRAY[${reference}]::text[])
      LIMIT 1
    `;
    return rows[0] ? mapTransaction(rows[0]) : null;
  },

  updateTransaction: async (id: string, data: any) => {
    if (data.status) {
      data.status = mapToPrismaTransactionStatus(data.status);
    }
    return prisma.transaction.update({
      where: { id },
      data
    });
  },

  updateTransactionStatus: async (id: string, status: TransactionStatus) => {
    return prisma.transaction.update({
      where: { id },
      data: { status: mapToPrismaTransactionStatus(status) }
    });
  },

  getSystemConfig: async () => {
    return prisma.systemConfig.findFirst();
  },

  addTransaction: async (tx: Transaction, items?: TransactionItemInput[]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { items: _readOnlyItems, printInfo: _readOnlyPrintInfo, ...rest } = tx;
    const created = await prisma.transaction.create({
      data: {
        ...rest,
        status: mapToPrismaTransactionStatus(rest.status),
        timestamp: new Date(rest.timestamp),
        transactionTimestamp: new Date(rest.transactionTimestamp),
        userCredentials: rest.userCredentials as any,
        ...(items && items.length > 0
          ? {
              items: {
                create: items.map((i) => ({
                  itemId: i.itemId ?? null,
                  name: i.name,
                  price: i.price,
                  quantity: i.quantity,
                  categoryName: i.categoryName ?? null,
                  mainCategoryName: i.mainCategoryName ?? null,
                })),
              },
            }
          : {}),
      },
      include: { items: true },
    });
    if (items && items.length > 0 && created.items.length !== items.length) {
      // Should be impossible given the nested create above — logged so a mismatch is never silent.
      console.error(
        `addTransaction: sent ${items.length} item line(s) for tx ${created.id} but only ${created.items.length} persisted`
      );
    }
    return created;
  },

  /** Creates or updates the table/shift shown on an order's printed kitchen/bar tickets. */
  upsertOrderPrintInfo: async (transactionId: string, data: { tableNo?: string | null; shift?: string | null }) => {
    const printInfo = await prisma.orderPrintInfo.upsert({
      where: { transactionId },
      create: { transactionId, tableNo: data.tableNo ?? null, shift: data.shift ?? null },
      update: {
        ...(data.tableNo !== undefined ? { tableNo: data.tableNo } : {}),
        ...(data.shift !== undefined ? { shift: data.shift } : {}),
      },
    });
    return { tableNo: printInfo.tableNo, shift: printInfo.shift };
  },

  // Merchant Update Token Methods
  createMerchantUpdateToken: async (merchantId: string, token: string, expiresAt: Date) => {
    return prisma.merchantUpdateToken.create({
      data: {
        merchantId,
        token,
        expiresAt
      }
    });
  },

  getMerchantUpdateToken: async (token: string) => {
    return prisma.merchantUpdateToken.findUnique({
      where: { token },
      include: { 
        merchant: {
          include: {
            documents: true
          }
        }
      }
    });
  },

  updateMerchantUpdateToken: async (id: string, data: any) => {
    return prisma.merchantUpdateToken.update({
      where: { id },
      data
    });
  }
};
