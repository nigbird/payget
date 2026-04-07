import { prisma } from '@/lib/prisma';
import { 
  MerchantStatus as PrismaMerchantStatus, 
  TransactionStatus as PrismaTransactionStatus,
  TeamRole,
  Merchant as PrismaMerchant,
  Transaction as PrismaTransaction,
  MerchantDocument as PrismaMerchantDocument,
  User as PrismaUser,
  UserRole
} from '@prisma/client';

export type MerchantStatus = 'pending' | 'branch_approved' | 'approved' | 'rejected' | 'active';
export type TransactionStatus = 'success' | 'failed' | 'initiated' | 'pending' | 'awaiting_pin' | 'processing';

export interface MerchantDocument {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
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
  callbackUrl: string;
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
  documents?: MerchantDocument[];
  _count?: {
    transactions: number;
  };
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
  transactionReference: string;
  serviceDescription: string;
  transactionTimestamp: string;
  userCredentials: {
    phone: string;
    authToken: string;
    initiatedById?: string;
    initiatedByName?: string;
  };
}

function mapMerchantStatus(s: PrismaMerchantStatus): MerchantStatus {
  if (s === 'PENDING') return 'pending';
  if (s === 'BRANCH_APPROVED') return 'branch_approved';
  if (s === 'APPROVED') return 'approved';
  if (s === 'ACTIVE') return 'active';
  return 'rejected';
}

function mapToPrismaMerchantStatus(s: MerchantStatus): PrismaMerchantStatus {
  if (s === 'pending') return 'PENDING';
  if (s === 'branch_approved') return 'BRANCH_APPROVED';
  if (s === 'approved') return 'APPROVED';
  if (s === 'active') return 'ACTIVE';
  return 'REJECTED';
}

function mapTransactionStatus(s: PrismaTransactionStatus): TransactionStatus {
  return s.toLowerCase() as TransactionStatus;
}

function mapToPrismaTransactionStatus(s: TransactionStatus): PrismaTransactionStatus {
  return s.toUpperCase() as PrismaTransactionStatus;
}

function mapMerchant(m: PrismaMerchant & { documents?: PrismaMerchantDocument[], _count?: { transactions: number } }): Merchant {
  return {
    ...m,
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
  };
}

function mapTransaction(tx: PrismaTransaction): Transaction {
  return {
    ...tx,
    status: mapTransactionStatus(tx.status),
    timestamp: tx.timestamp.toISOString(),
    transactionTimestamp: tx.transactionTimestamp.toISOString(),
    userCredentials: tx.userCredentials as {
      phone: string;
      authToken: string;
      initiatedById?: string;
      initiatedByName?: string;
    }
  };
}

export type MerchantTeamRole = 'payment_initiator' | 'account_admin';
export type MerchantTeamMemberStatus = 'active' | 'deactivated';

export interface MerchantTeamMember {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  phone?: string;
  role: MerchantTeamRole;
  status: MerchantTeamMemberStatus;
  createdAt: string;
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
    createdAt: tm.createdAt.toISOString()
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

  addMerchantTeamMember: async (data: any) => {
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
    return merchants.map(mapMerchant);
  },
  
  getMerchantById: async (id: string) => {
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
    return mapMerchant(m);
  },

  findMerchantByIdentifier: async (identifier: string) => {
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
    return mapMerchant(m);
  },

  findMerchantByResetToken: async (token: string) => {
    const m = await prisma.merchant.findFirst({
      where: { passwordResetToken: token },
      include: { documents: true }
    }) as any
    if (!m) return null
    return mapMerchant(m)
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
    return prisma.merchant.update({
      where: { id },
      data: rest
    });
  },

  getTransactions: async () => {
    const txs = await prisma.transaction.findMany({
      orderBy: { timestamp: 'desc' }
    });
    return txs.map(mapTransaction);
  },

  getTransactionsByMerchant: async (merchantId: string) => {
    const txs = await prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { timestamp: 'desc' }
    });
    return txs.map(mapTransaction);
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

  addTransaction: async (tx: Transaction) => {
    return prisma.transaction.create({
      data: {
        ...tx,
        status: mapToPrismaTransactionStatus(tx.status),
        timestamp: new Date(tx.timestamp),
        transactionTimestamp: new Date(tx.transactionTimestamp),
        userCredentials: tx.userCredentials as any
      }
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
  }
};
