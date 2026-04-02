import { type AiMerchantOnboardingAssistantOutput } from '@/ai/flows/ai-merchant-onboarding-assistant';

export type MerchantStatus = 'pending' | 'branch_approved' | 'approved' | 'rejected';

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
  updatedAt?: string;
}

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
  password?: string;
  passwordResetToken?: string;
  passwordResetExpires?: string;
  /**
   * JWE symmetric secret for encrypting/decrypting customer payloads (mock provider).
   * In production this should be securely stored server-side (KMS/secret manager).
   */
  jweSecret: string;
  accountNumber: string;
  dailyLimit: number; // Daily Amount Limit
  transactionLimit: number; // Max Per Transaction Amount
  dailyCountLimit: number; // New: Daily Transaction Count Limit
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

export type TransactionStatus =
  | 'success'
  | 'failed'
  | 'initiated'
  | 'pending'
  | 'awaiting_pin'
  | 'processing';

export interface Transaction {
  id: string;
  merchantId: string;
  amount: number;
  status: TransactionStatus;
  callbackUrl: string;
  description: string;
  timestamp: string;
  payerPhone?: string;
  /**
   * Gateway-generated payment reference (used by provider callbacks).
   */
  transactionReference: string;
  /**
   * Customer-facing description of the service being paid for.
   */
  serviceDescription: string;
  /**
   * Timestamp originating from the merchant payload (gateway records it for audit).
   */
  transactionTimestamp: string;
  /**
   * Customer credentials included in the encrypted payload (mock only).
   */
  userCredentials: {
    phone: string;
    authToken: string;
  };
}

export interface SystemConfig {
  maxFileSizeMB: number;
  allowedFileTypes: string[];
  districts: string[];
  branches: string[];
  resetTimeoutSeconds: number;
}

const globalStore = global as unknown as {
  merchants: Merchant[];
  transactions: Transaction[];
  merchantTeamMembers: MerchantTeamMember[];
  systemConfig: SystemConfig;
};

if (!globalStore.merchants) {
  globalStore.merchants = [
    {
      id: 'm1',
      name: 'TechGear Solutions',
      email: 'onboarding@techgear.io',
      password: 'password123',
      jweSecret: 'demo_jwe_secret_m1',
      accountNumber: '1234567890',
      dailyLimit: 50000,
      transactionLimit: 5000,
      dailyCountLimit: 100,
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
      timestamp: new Date().toISOString(),
      transactionReference: 'ref_demo_tx1',
      serviceDescription: 'Order #8821',
      transactionTimestamp: new Date().toISOString(),
      userCredentials: { phone: '+1234567890', authToken: 'demo_auth_token_tx1' },
      payerPhone: '+1234567890'
    },
    {
      id: '2',
      merchantId: 'm1',
      amount: 1250.00,
      status: 'pending',
      callbackUrl: 'https://techgear.io/api/webhook',
      description: 'Invoice for Enterprise Support Package (Q3)',
      timestamp: new Date().toISOString(),
      transactionReference: 'ref_demo_tx2',
      serviceDescription: 'Invoice for Enterprise Support Package (Q3)',
      transactionTimestamp: new Date().toISOString(),
      userCredentials: { phone: '+1 (555) 987-6543', authToken: 'demo_auth_token_tx2' },
      payerPhone: '+1 (555) 987-6543'
    }
  ];
}

if (!globalStore.systemConfig) {
  globalStore.systemConfig = {
    maxFileSizeMB: 5,
    allowedFileTypes: ['.pdf', '.jpg', '.jpeg', '.png'],
    districts: ['Central Business District', 'North Industrial', 'South Residential', 'East Port', 'West Hills'],
    branches: ['Downtown HQ', 'North Hub', 'South Plaza', 'East Wing', 'West Station'],
    resetTimeoutSeconds: 60
  };
}

if (!globalStore.merchantTeamMembers) {
  globalStore.merchantTeamMembers = [
    {
      id: 'tm1',
      merchantId: 'm1',
      name: 'Aisha Payments',
      email: 'payments@techgear.io',
      phone: '+1234567890',
      role: 'payment_initiator',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'tm2',
      merchantId: 'm1',
      name: 'Morgan Admin',
      email: 'admin@techgear.io',
      role: 'account_admin',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ];
}

export const db = {
  getMerchants: () => globalStore.merchants,
  getMerchantById: (id: string) => globalStore.merchants.find(m => m.id === id),
  findMerchantByIdentifier: (identifier: string) => 
    globalStore.merchants.find(m => m.id === identifier || m.email === identifier || m.contactPhone === identifier),
  findMerchantByResetToken: (token: string) => 
    globalStore.merchants.find(m => m.passwordResetToken === token),
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
      else delete m.rejectionReason;
    }
  },
  getTransactions: () => globalStore.transactions,
  getTransactionById: (id: string) => globalStore.transactions.find(t => t.id === id),
  getTransactionsByMerchant: (merchantId: string) => 
    globalStore.transactions.filter(t => t.merchantId === merchantId),
  addTransaction: (tx: Transaction) => {
    globalStore.transactions.push(tx);
  },
  updateTransactionStatus: (id: string, status: TransactionStatus) => {
    const index = globalStore.transactions.findIndex(t => t.id === id);
    if (index !== -1) {
      globalStore.transactions[index] = {
        ...globalStore.transactions[index],
        status
      };
    }
  },
  getMerchantTeamMembersByMerchantId: (merchantId: string) =>
    globalStore.merchantTeamMembers.filter(m => m.merchantId === merchantId),
  addMerchantTeamMember: (member: MerchantTeamMember) => {
    globalStore.merchantTeamMembers.push(member);
  },
  updateMerchantTeamMember: (memberId: string, updates: Partial<MerchantTeamMember>) => {
    const index = globalStore.merchantTeamMembers.findIndex(m => m.id === memberId);
    if (index !== -1) {
      globalStore.merchantTeamMembers[index] = {
        ...globalStore.merchantTeamMembers[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };
    }
  },
  deactivateMerchantTeamMember: (memberId: string) => {
    const member = globalStore.merchantTeamMembers.find(m => m.id === memberId);
    if (member) {
      member.status = 'deactivated';
      member.updatedAt = new Date().toISOString();
    }
  },
  setMerchantTeamMemberActive: (memberId: string, active: boolean) => {
    const member = globalStore.merchantTeamMembers.find(m => m.id === memberId);
    if (member) {
      member.status = active ? 'active' : 'deactivated';
      member.updatedAt = new Date().toISOString();
    }
  },
  getSystemConfig: () => globalStore.systemConfig,
  updateSystemConfig: (config: Partial<SystemConfig>) => {
    globalStore.systemConfig = { ...globalStore.systemConfig, ...config };
  }
};
