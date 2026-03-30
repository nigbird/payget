import { type AiMerchantOnboardingAssistantOutput } from '@/ai/flows/ai-merchant-onboarding-assistant';

export type MerchantStatus = 'pending' | 'approved' | 'rejected';

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
  password?: string; // Added for self-service status tracking
  accountNumber: string;
  dailyLimit: number;
  transactionLimit: number;
  status: MerchantStatus;
  rejectionReason?: string;
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
  documents: MerchantDocument[];
  createdAt: string;
  updatedAt?: string;
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

export interface SystemConfig {
  maxFileSizeMB: number;
  allowedFileTypes: string[];
  districts: string[];
  branches: string[];
}

// Global singleton for demo data
const globalStore = global as unknown as {
  merchants: Merchant[];
  transactions: Transaction[];
  systemConfig: SystemConfig;
};

if (!globalStore.merchants) {
  globalStore.merchants = [
    {
      id: 'm1',
      name: 'TechGear Solutions',
      email: 'onboarding@techgear.io',
      password: 'password123',
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
      documents: [
        { id: 'doc1', name: 'trade_license.pdf', type: 'application/pdf', size: 1024 * 1024 * 1.5, uploadedAt: new Date().toISOString() }
      ],
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

if (!globalStore.systemConfig) {
  globalStore.systemConfig = {
    maxFileSizeMB: 5,
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    districts: ['Central Business District', 'North Industrial', 'South Residential', 'East Port', 'West Hills'],
    branches: ['Downtown HQ', 'North Hub', 'South Plaza', 'East Wing', 'West Station']
  };
}

export const db = {
  getMerchants: () => globalStore.merchants,
  getMerchantById: (id: string) => globalStore.merchants.find(m => m.id === id),
  addMerchant: (merchant: Merchant) => {
    globalStore.merchants.push(merchant);
  },
  updateMerchant: (id: string, updates: Partial<Merchant>) => {
    const index = globalStore.merchants.findIndex(m => m.id === id);
    if (index !== -1) {
      globalStore.merchants[index] = { 
        ...globalStore.merchants[index], 
        ...updates,
        updatedAt: new Date().toISOString()
      };
    }
  },
  updateMerchantStatus: (id: string, status: MerchantStatus, reason?: string) => {
    const m = globalStore.merchants.find(merchant => merchant.id === id);
    if (m) {
      m.status = status;
      if (reason) m.rejectionReason = reason;
      else delete m.rejectionReason; // Clear reason if approved
    }
  },
  getTransactions: () => globalStore.transactions,
  getTransactionsByMerchant: (merchantId: string) => 
    globalStore.transactions.filter(t => t.merchantId === merchantId),
  addTransaction: (tx: Transaction) => {
    globalStore.transactions.push(tx);
  },
  getSystemConfig: () => globalStore.systemConfig,
  updateSystemConfig: (config: Partial<SystemConfig>) => {
    globalStore.systemConfig = { ...globalStore.systemConfig, ...config };
  }
};
