import { type AiMerchantOnboardingAssistantOutput } from '@/ai/flows/ai-merchant-onboarding-assistant';

export type MerchantStatus = 'pending' | 'approved' | 'rejected';

export interface Merchant {
  id: string;
  name: string;
  email: string;
  accountNumber: string;
  dailyLimit: number;
  transactionLimit: number;
  status: MerchantStatus;
  businessDescription: string;
  websiteUrl: string;
  callbackUrl: string;
  contactName: string;
  contactPhone: string;
  branchName: string;
  district: string;
  category: string;
  riskFactors: string[];
  businessType: string;
  createdAt: string;
}

export type TransactionStatus = 'success' | 'failed' | 'initiated';

export interface Transaction {
  id: string;
  merchantId: string;
  amount: number;
  status: TransactionStatus;
  callbackUrl: string;
  description: string;
  timestamp: string;
}

// Global singleton for demo data
const globalStore = global as unknown as {
  merchants: Merchant[];
  transactions: Transaction[];
};

if (!globalStore.merchants) {
  globalStore.merchants = [
    {
      id: 'm1',
      name: 'TechGear Solutions',
      email: 'onboarding@techgear.io',
      accountNumber: '1234567890',
      dailyLimit: 50000,
      transactionLimit: 5000,
      status: 'approved',
      businessDescription: 'E-commerce platform selling high-end tech accessories.',
      websiteUrl: 'https://techgear.io',
      callbackUrl: 'https://techgear.io/api/webhook',
      contactName: 'John Doe',
      contactPhone: '+1234567890',
      branchName: 'Downtown HQ',
      district: 'Central Business District',
      category: 'E-commerce',
      riskFactors: [],
      businessType: 'Retail',
      createdAt: new Date().toISOString()
    }
  ];
}

if (!globalStore.transactions) {
  globalStore.transactions = [
    {
      id: 'tx1',
      merchantId: 'm1',
      amount: 450.00,
      status: 'success',
      callbackUrl: 'https://techgear.io/api/webhook',
      description: 'Order #8821',
      timestamp: new Date().toISOString()
    }
  ];
}

export const db = {
  getMerchants: () => globalStore.merchants,
  getMerchantById: (id: string) => globalStore.merchants.find(m => m.id === id),
  addMerchant: (merchant: Merchant) => {
    globalStore.merchants.push(merchant);
  },
  updateMerchantStatus: (id: string, status: MerchantStatus) => {
    const m = globalStore.merchants.find(merchant => merchant.id === id);
    if (m) m.status = status;
  },
  getTransactions: () => globalStore.transactions,
  getTransactionsByMerchant: (merchantId: string) => 
    globalStore.transactions.filter(t => t.merchantId === merchantId),
  addTransaction: (tx: Transaction) => {
    globalStore.transactions.push(tx);
  }
};
