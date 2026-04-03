
import { prisma } from '@/lib/prisma';
import { 
  MerchantStatus as PrismaMerchantStatus, 
  TransactionStatus as PrismaTransactionStatus,
} from '@prisma/client';

export type MerchantStatus = 'pending' | 'branch_approved' | 'approved' | 'rejected';
export type TransactionStatus = 'success' | 'failed' | 'initiated' | 'pending' | 'awaiting_pin' | 'processing';

function mapMerchantStatus(s: PrismaMerchantStatus): MerchantStatus {
  if (s === 'PENDING') return 'pending';
  if (s === 'BRANCH_APPROVED') return 'branch_approved';
  if (s === 'APPROVED') return 'approved';
  return 'rejected';
}

function mapTransactionStatus(s: PrismaTransactionStatus): TransactionStatus {
  return s.toLowerCase() as TransactionStatus;
}

export const db = {
  getMerchants: async () => {
    const merchants = await prisma.merchant.findMany({
      include: { documents: true },
      orderBy: { createdAt: 'desc' }
    });
    return merchants.map(m => ({
      ...m,
      status: mapMerchantStatus(m.status),
      createdAt: m.createdAt.toISOString()
    }));
  },
  
  getMerchantById: async (id: string) => {
    const m = await prisma.merchant.findUnique({
      where: { id },
      include: { documents: true }
    });
    if (!m) return null;
    return {
      ...m,
      status: mapMerchantStatus(m.status),
      createdAt: m.createdAt.toISOString()
    };
  },

  findMerchantByIdentifier: async (identifier: string) => {
    const m = await prisma.merchant.findFirst({
      where: {
        OR: [
          { id: identifier },
          { email: identifier },
          { contactPhone: identifier }
        ]
      },
      include: { documents: true }
    });
    if (!m) return null;
    return {
      ...m,
      status: mapMerchantStatus(m.status),
      createdAt: m.createdAt.toISOString()
    };
  },

  findMerchantByResetToken: async (token: string) => {
    const m = await prisma.merchant.findFirst({
      where: { passwordResetToken: token },
      include: { documents: true }
    });
    if (!m) return null;
    return {
      ...m,
      status: mapMerchantStatus(m.status),
      createdAt: m.createdAt.toISOString()
    };
  },

  getTransactionsByMerchant: async (merchantId: string) => {
    const txs = await prisma.transaction.findMany({
      where: { merchantId },
      orderBy: { timestamp: 'desc' }
    });
    return txs.map(tx => ({
      ...tx,
      status: mapTransactionStatus(tx.status),
      timestamp: tx.timestamp.toISOString(),
      transactionTimestamp: tx.transactionTimestamp.toISOString(),
      userCredentials: tx.userCredentials as { phone: string; authToken: string }
    }));
  },

  getTransactionById: async (id: string) => {
    const tx = await prisma.transaction.findUnique({
      where: { id }
    });
    if (!tx) return null;
    return {
      ...tx,
      status: mapTransactionStatus(tx.status),
      timestamp: tx.timestamp.toISOString(),
      transactionTimestamp: tx.transactionTimestamp.toISOString(),
      userCredentials: tx.userCredentials as { phone: string; authToken: string }
    };
  },

  getSystemConfig: async () => {
    return prisma.systemConfig.findFirst();
  },

  updateMerchant: async (id: string, data: any) => {
    // Handle status mapping if present
    if (data.status) {
      data.status = data.status.toUpperCase();
    }
    // Remove relation fields for plain update
    const { documents, ...rest } = data;
    return prisma.merchant.update({
      where: { id },
      data: rest
    });
  }
};
