-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE', 'MERCHANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "CashbackMode" AS ENUM ('ALL_CUSTOMERS', 'CATEGORY_ELIGIBLE');

-- CreateEnum
CREATE TYPE "CashbackProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CashbackRequestType" AS ENUM ('REFERENCE_UPDATE', 'RETRY');

-- CreateEnum
CREATE TYPE "CashbackRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('PENDING', 'BRANCH_APPROVED', 'APPROVED', 'REJECTED', 'REJECTED_WITH_UPDATE', 'RESUBMITTED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('PAYMENT_INITIATOR', 'ACCOUNT_ADMIN');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK', 'TELEBIRR');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('SUCCESS', 'FAILED', 'INITIATED', 'PENDING', 'AWAITING_PIN', 'PROCESSING');

-- CreateEnum
CREATE TYPE "TokenType" AS ENUM ('PASSWORD_SETUP', 'MERCHANT_UPDATE', 'RESET_PASSWORD', 'PAYMENT');

-- CreateEnum
CREATE TYPE "MerchantCallbackStatus" AS ENUM ('PENDING', 'DELIVERED', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "password" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'MERCHANT',
    "customRoleId" TEXT,
    "merchantId" TEXT,
    "isHeadOffice" BOOLEAN NOT NULL DEFAULT false,
    "district" TEXT,
    "branch" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "firstLogin" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "logoUrl" TEXT,
    "jweSecret" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "dailyLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transactionLimit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dailyCountLimit" INTEGER NOT NULL DEFAULT 0,
    "status" "MerchantStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "businessDescription" TEXT,
    "websiteUrl" TEXT,
    "callbackUrl" TEXT,
    "contactName" TEXT NOT NULL,
    "contactUsername" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "riskFactors" TEXT[],
    "createdBy" TEXT,
    "limitsSetBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetExpires" TIMESTAMP(3),
    "updateComments" JSONB,
    "qrEnabled" BOOLEAN NOT NULL DEFAULT false,
    "qrLogoUrl" TEXT,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackRequest" (
    "id" TEXT NOT NULL,
    "type" "CashbackRequestType" NOT NULL,
    "cashbackTransactionId" TEXT NOT NULL,
    "oldTransactionReference" TEXT,
    "newTransactionReference" TEXT,
    "reason" TEXT NOT NULL,
    "comments" TEXT,
    "status" "CashbackRequestStatus" NOT NULL DEFAULT 'PENDING',
    "makerId" TEXT NOT NULL,
    "checkerId" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCashbackConfig" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" "CashbackMode" NOT NULL DEFAULT 'ALL_CUSTOMERS',
    "subsidiaryAccountNumber" TEXT,
    "allCustomersPercent" DOUBLE PRECISION,
    "allCustomersMinAmount" DOUBLE PRECISION,
    "allCustomersMaxAmount" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCashbackConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackCategory" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "percent" DOUBLE PRECISION NOT NULL,
    "minTransactionAmount" DOUBLE PRECISION DEFAULT 0,
    "maxTransactionAmount" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackEligibleCustomer" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "accountNumber" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackEligibleCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackTransaction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "paymentTransactionId" TEXT NOT NULL,
    "transactionReference" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "categoryId" TEXT,
    "customerPhone" TEXT,
    "customerAccount" TEXT,
    "paymentAmount" DOUBLE PRECISION NOT NULL,
    "cashbackAmount" DOUBLE PRECISION NOT NULL,
    "cashbackPercent" DOUBLE PRECISION NOT NULL,
    "status" "CashbackProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "skipReason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "subsidiaryAccount" TEXT,
    "providerDebitRef" TEXT,
    "providerCreditRef" TEXT,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashbackProcessingLog" (
    "id" TEXT NOT NULL,
    "cashbackTransactionId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashbackProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantQrCode" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantQrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantUpdateToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "otp" TEXT,
    "otpExpires" TIMESTAMP(3),
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantUpdateToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT NOT NULL,

    CONSTRAINT "MerchantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantTeamMember" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "TeamRole" NOT NULL DEFAULT 'PAYMENT_INITIATOR',
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
    "callbackUrl" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payerPhone" TEXT,
    "payerAccount" TEXT,
    "transactionReference" TEXT NOT NULL,
    "serviceDescription" TEXT NOT NULL,
    "transactionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userCredentials" JSONB NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'BANK',

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL DEFAULT '1',
    "maxFileSizeMB" INTEGER NOT NULL DEFAULT 5,
    "allowedFileTypes" TEXT[],
    "districts" JSONB NOT NULL DEFAULT '[]',
    "branches" JSONB NOT NULL DEFAULT '[]',
    "categories" JSONB NOT NULL DEFAULT '[]',
    "businessTypes" JSONB NOT NULL DEFAULT '[]',
    "resetTimeoutSeconds" INTEGER NOT NULL DEFAULT 300,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpLockout" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpLockout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginIdentifierLockout" (
    "normalizedKey" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginIdentifierLockout_pkey" PRIMARY KEY ("normalizedKey")
);

-- CreateTable
CREATE TABLE "OpaqueToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "type" "TokenType" NOT NULL,
    "data" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpaqueToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestNonce" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "RequestNonce_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantCallbackQueue" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "callbackUrl" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "MerchantCallbackStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantCallbackQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "User"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_replacedById_key" ON "RefreshToken"("replacedById");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_name_key" ON "Permission"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_email_key" ON "Merchant"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_passwordResetToken_key" ON "Merchant"("passwordResetToken");

-- CreateIndex
CREATE INDEX "CashbackRequest_cashbackTransactionId_idx" ON "CashbackRequest"("cashbackTransactionId");

-- CreateIndex
CREATE INDEX "CashbackRequest_status_idx" ON "CashbackRequest"("status");

-- CreateIndex
CREATE INDEX "CashbackRequest_createdAt_idx" ON "CashbackRequest"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCashbackConfig_merchantId_key" ON "MerchantCashbackConfig"("merchantId");

-- CreateIndex
CREATE INDEX "CashbackCategory_merchantId_idx" ON "CashbackCategory"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "CashbackCategory_configId_name_key" ON "CashbackCategory"("configId", "name");

-- CreateIndex
CREATE INDEX "CashbackEligibleCustomer_merchantId_phone_idx" ON "CashbackEligibleCustomer"("merchantId", "phone");

-- CreateIndex
CREATE INDEX "CashbackEligibleCustomer_categoryId_idx" ON "CashbackEligibleCustomer"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CashbackEligibleCustomer_merchantId_phone_categoryId_key" ON "CashbackEligibleCustomer"("merchantId", "phone", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CashbackTransaction_paymentTransactionId_key" ON "CashbackTransaction"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CashbackTransaction_idempotencyKey_key" ON "CashbackTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CashbackTransaction_merchantId_createdAt_idx" ON "CashbackTransaction"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "CashbackTransaction_status_idx" ON "CashbackTransaction"("status");

-- CreateIndex
CREATE INDEX "CashbackProcessingLog_cashbackTransactionId_createdAt_idx" ON "CashbackProcessingLog"("cashbackTransactionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantQrCode_token_key" ON "MerchantQrCode"("token");

-- CreateIndex
CREATE INDEX "MerchantQrCode_token_idx" ON "MerchantQrCode"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantUpdateToken_token_key" ON "MerchantUpdateToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantTeamMember_merchantId_email_key" ON "MerchantTeamMember"("merchantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantTeamMember_merchantId_phone_key" ON "MerchantTeamMember"("merchantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_transactionReference_key" ON "Transaction"("transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "IpLockout_ipAddress_key" ON "IpLockout"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "OpaqueToken_token_key" ON "OpaqueToken"("token");

-- CreateIndex
CREATE INDEX "OpaqueToken_token_idx" ON "OpaqueToken"("token");

-- CreateIndex
CREATE INDEX "OpaqueToken_expiresAt_idx" ON "OpaqueToken"("expiresAt");

-- CreateIndex
CREATE INDEX "RequestNonce_expiresAt_idx" ON "RequestNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RequestNonce_merchantId_nonce_key" ON "RequestNonce"("merchantId", "nonce");

-- CreateIndex
CREATE INDEX "MerchantCallbackQueue_status_nextRetryAt_idx" ON "MerchantCallbackQueue"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "MerchantCallbackQueue_transactionId_idx" ON "MerchantCallbackQueue"("transactionId");

-- CreateIndex
CREATE INDEX "MerchantCallbackQueue_merchantId_idx" ON "MerchantCallbackQueue"("merchantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_limitsSetBy_fkey" FOREIGN KEY ("limitsSetBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackRequest" ADD CONSTRAINT "CashbackRequest_cashbackTransactionId_fkey" FOREIGN KEY ("cashbackTransactionId") REFERENCES "CashbackTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackRequest" ADD CONSTRAINT "CashbackRequest_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackRequest" ADD CONSTRAINT "CashbackRequest_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantCashbackConfig" ADD CONSTRAINT "MerchantCashbackConfig_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackCategory" ADD CONSTRAINT "CashbackCategory_configId_fkey" FOREIGN KEY ("configId") REFERENCES "MerchantCashbackConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackEligibleCustomer" ADD CONSTRAINT "CashbackEligibleCustomer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackEligibleCustomer" ADD CONSTRAINT "CashbackEligibleCustomer_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CashbackCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackTransaction" ADD CONSTRAINT "CashbackTransaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackTransaction" ADD CONSTRAINT "CashbackTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CashbackCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackProcessingLog" ADD CONSTRAINT "CashbackProcessingLog_cashbackTransactionId_fkey" FOREIGN KEY ("cashbackTransactionId") REFERENCES "CashbackTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantQrCode" ADD CONSTRAINT "MerchantQrCode_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantUpdateToken" ADD CONSTRAINT "MerchantUpdateToken_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantDocument" ADD CONSTRAINT "MerchantDocument_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantTeamMember" ADD CONSTRAINT "MerchantTeamMember_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestNonce" ADD CONSTRAINT "RequestNonce_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
