import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/app/lib/db"
import bcrypt from "bcryptjs"
import { verifySalesOtp } from "@/lib/otp"
import { writeAuditLog } from "@/lib/audit-log"
import { prisma } from "@/lib/prisma"
import { 
  generateRefreshTokenValue,
  hashRefreshToken,
  computeRefreshTokenExpiresAt,
} from "@/lib/token-auth"
import crypto from "crypto"
import { headers } from "next/headers"
import {
  checkIpLockout,
  checkLoginIdentifierLockout,
  recordFailedLoginAttempt,
  resetIpLockout,
  resetLoginIdentifierLockout,
  resetUserLockout,
} from "@/lib/rate-limit"
import { normalizeLoginIdentifierForLockout } from "@/lib/login-identifier-normalize"

function throwCredentialsLockoutCode(code: string): never {
  const err = new CredentialsSignin()
  err.code = code
  throw err
}

async function recordCredentialFailureAndThrowIfLocked(ip: string, normalizedKey: string) {
  try {
    const { ip: ipSt, identifier: idSt } = await recordFailedLoginAttempt(ip, normalizedKey)
    if (ipSt.locked) {
      throwCredentialsLockoutCode(`LOCKOUT_IP_${ipSt.retryAfterSeconds}`)
    }
    if (idSt.locked) {
      throwCredentialsLockoutCode(`LOCKOUT_IDENT_${idSt.retryAfterSeconds}`)
    }
  } catch (e) {
    if (e instanceof CredentialsSignin) throw e
    console.error("[auth] recordCredentialFailureAndThrowIfLocked", e)
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        loginType: { label: "Login Type", type: "text" }
      },
      authorize: async (credentials) => {
        const headerList = await headers()
        const xForwardedFor = headerList.get("x-forwarded-for")
        const ip = xForwardedFor ? xForwardedFor.split(",")[0].trim() : "127.0.0.1"

        const ipLockout = await checkIpLockout(ip)
        if (ipLockout.locked) {
          throwCredentialsLockoutCode(`LOCKOUT_IP_${ipLockout.retryAfterSeconds}`)
        }

        if (!credentials?.email || !credentials?.password) {
          await writeAuditLog({
          userId: null,
          action: "LOGIN_FAILURE",
          entityType: "USER",
          entityId: null,
          newValue: {
            result: "failed",
            reason: "MISSING_FIELDS",
            identifier: credentials?.email ? String(credentials.email).substring(0, 20) + "..." : null,
          },
        });
          return null;
        }

        const identifier = String(credentials.email).trim()
        const loginType = String(credentials.loginType || "")
        const normalizedKey = normalizeLoginIdentifierForLockout(identifier)

        const identifierLockout = await checkLoginIdentifierLockout(normalizedKey)
        if (identifierLockout.locked) {
          throwCredentialsLockoutCode(`LOCKOUT_IDENT_${identifierLockout.retryAfterSeconds}`)
        }

        let user = await db.findUserByEmail(identifier)

        // Fallback: allow merchant login by contact username (email or phone).
        if (!user) {
          const merchant = await db.findMerchantByIdentifier(identifier)
          if (merchant?.id) {
            user = await db.findMerchantUserByMerchantId(merchant.id)
          }
        }

        if (!user || !user.password) {
          await writeAuditLog({
          userId: null,
          action: "LOGIN_FAILURE",
          entityType: "USER",
          entityId: null,
          newValue: {
            result: "failed",
            reason: "USER_NOT_FOUND",
            identifier: identifier.substring(0, 20) + "...",
          },
        });
          await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
          return null;
        }
        
        // Role-based validation
        if (loginType === "admin") {
          const adminRoles = ['ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE']
          if (!adminRoles.includes(user.role)) {
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_FAILURE",
              entityType: "USER",
              entityId: user.id,
              newValue: {
                result: "failed",
                reason: "NOT_ADMIN_USER",
              },
            });
            await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
            throw new Error("AccessDenied: Not an admin user")
          }
        } else if (loginType === "merchant") {
          if (user.role !== 'MERCHANT') {
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_FAILURE",
              entityType: "USER",
              entityId: user.id,
              newValue: {
                result: "failed",
                reason: "NOT_MERCHANT_USER",
              },
            });
            await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
            throw new Error("AccessDenied: Not a merchant user")
          }
        }

        // If the user is a merchant, ensure the merchant account is ACTIVE
        if (user.role === 'MERCHANT' && user.merchantId) {
          if (user.merchant?.status !== 'ACTIVE') {
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_FAILURE",
              entityType: "USER",
              entityId: user.id,
              newValue: {
                result: "failed",
                reason: "ACCOUNT_NOT_ACTIVE",
                merchantId: user.merchantId,
                merchantName: user.merchant?.name,
              },
            });
            await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
            return null; // Deny login for inactive/pending merchants
          }

          // Merchant login must match the current configured username only.
          const currentUsername = user.merchant?.contactUsername
          if (!currentUsername) {
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_FAILURE",
              entityType: "USER",
              entityId: user.id,
              newValue: {
                result: "failed",
                reason: "INVALID_CREDENTIALS",
              },
            });
            await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
            return null;
          }
          const provided = normalizeLoginIdentifierForLockout(identifier)
          const expected = normalizeLoginIdentifierForLockout(currentUsername)
          if (provided !== expected) {
            await writeAuditLog({
              userId: user.id,
              action: "LOGIN_FAILURE",
              entityType: "USER",
              entityId: user.id,
              newValue: {
                result: "failed",
                reason: "INVALID_CREDENTIALS",
              },
            });
            await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
            return null;
          }
        }
        
        const isValid = await bcrypt.compare(credentials.password as string, user.password)
        if (!isValid) {
          await writeAuditLog({
            userId: user.id,
            action: "LOGIN_FAILURE",
            entityType: "USER",
            entityId: user.id,
            newValue: {
              result: "failed",
              reason: "INCORRECT_PASSWORD",
            },
          });
          await recordCredentialFailureAndThrowIfLocked(ip, normalizedKey)
          return null;
        }
        
        await writeAuditLog({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          entityType: "USER",
          entityId: user.id,
          newValue: {
            result: "success",
            role: user.role,
            merchantId: user.merchantId,
            merchantName: user.merchant?.name,
          },
        });
        
        try {
          await resetIpLockout(ip)
          await resetLoginIdentifierLockout(normalizedKey)
          await resetUserLockout(user.id)
        } catch (e) {
          console.error("[auth] reset lockouts after successful login", e)
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          merchantId: user.merchantId,
          isHeadOffice: user.isHeadOffice,
          district: user.district,
          branch: user.branch,
          firstLogin: (user as any).firstLogin,
          permissions: (user as any).customRole?.permissions.map((p: any) => p.permission.name) || []
        }
      }
    }),
    Credentials({
      id: "sales-otp",
      name: "Sales OTP",
      credentials: {
        phone: { label: "Phone", type: "tel" },
        otp: { label: "OTP", type: "text" },
        merchantId: { label: "Merchant ID", type: "text" }
      },
      authorize: async (credentials) => {
        const rawPhone = credentials?.phone
        const rawOtp = credentials?.otp
        const rawMerchantId = credentials?.merchantId
        const phone = typeof rawPhone === 'string' ? rawPhone.trim() : ''
        const otp = typeof rawOtp === 'string' ? rawOtp.trim() : ''
        const merchantId = typeof rawMerchantId === 'string' ? rawMerchantId.trim() : ''
        
        if (!phone || !otp) {
          await writeAuditLog({
            userId: null,
            action: "LOGIN_FAILURE",
            entityType: "USER",
            entityId: null,
            newValue: {
              result: "failed",
              reason: "MISSING_FIELDS",
              loginType: "SALES_OTP",
            },
          });
          return null;
        }

        if (!verifySalesOtp(phone, otp)) {
          await writeAuditLog({
            userId: null,
            action: "LOGIN_FAILURE",
            entityType: "USER",
            entityId: null,
            newValue: {
              result: "failed",
              reason: "INVALID_OTP",
              phone: phone.substring(0, 10) + "...",
            },
          });
          return null;
        }

        const members = (await db.findMerchantTeamMembersByPhone(phone)) as any[]
        const activeMembers = members.filter(
          (member) =>
            member.status === 'ACTIVE' &&
            member.merchant &&
            member.merchant.status === 'ACTIVE'
        )

        if (activeMembers.length === 0) {
          await writeAuditLog({
            userId: null,
            action: "LOGIN_FAILURE",
            entityType: "USER",
            entityId: null,
            newValue: {
              result: "failed",
              reason: "NO_ACTIVE_MEMBERS",
              phone: phone.substring(0, 10) + "...",
            },
          });
          return null;
        }

        // If merchantId is provided, find that specific member/merchant association
        let selectedMember = activeMembers[0]
        if (merchantId) {
          const found = activeMembers.find(m => m.merchantId === merchantId)
          if (found) {
            selectedMember = found
          }
        }

        const assignedMerchantIds = Array.from(
          new Set(activeMembers.map((member) => member.merchantId))
        )

        const assignedMerchants = activeMembers
          .filter((member) => member.merchant)
          .map((member) => ({ id: member.merchantId, name: member.merchant.name }))

        await writeAuditLog({
          userId: null,
          action: "LOGIN_SUCCESS",
          entityType: "USER",
          entityId: `sales-${phone}`,
          newValue: {
            result: "success",
            loginType: "SALES_OTP",
            memberName: selectedMember.name,
            merchantId: selectedMember.merchantId,
            merchantName: selectedMember.merchant.name,
          },
        });
        
        return {
          id: `sales-${phone}`,
          email: selectedMember.email,
          name: selectedMember.name,
          role: 'SALES',
          merchantId: selectedMember.merchantId,
          teamMemberId: selectedMember.id,
          assignedMerchantIds,
          assignedMerchants,
          permissions: []
        }
      }
    })
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
            if (user) {
        token.role = (user as any).role;
        token.merchantId = (user as any).merchantId;
        token.id = user.id;
        token.permissions = (user as any).permissions;
        token.isHeadOffice = (user as any).isHeadOffice;
        token.district = (user as any).district;
        token.branch = (user as any).branch;
        token.assignedMerchantIds = (user as any).assignedMerchantIds;
        token.assignedMerchants = (user as any).assignedMerchants;
        token.firstLogin = (user as any).firstLogin;
        token.teamMemberId = (user as any).teamMemberId;
      }
      if (trigger === "update" && session) {
        // Update token with new session data
        if (session.user?.email) token.email = session.user.email;
        if (session.user?.name) token.name = session.user.name;
        if (session.user?.role) token.role = session.user.role;
        if (session.user?.permissions) token.permissions = session.user.permissions;
        if (session.user?.isHeadOffice !== undefined) token.isHeadOffice = session.user.isHeadOffice;
        if (session.user?.district !== undefined) token.district = session.user.district;
        if (session.user?.branch !== undefined) token.branch = session.user.branch;
        if ((session.user as any).assignedMerchantIds) token.assignedMerchantIds = (session.user as any).assignedMerchantIds;
        if ((session.user as any).assignedMerchants) token.assignedMerchants = (session.user as any).assignedMerchants;
        if ((session.user as any).firstLogin !== undefined) token.firstLogin = (session.user as any).firstLogin;
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).merchantId = token.merchantId;
        (session.user as any).permissions = token.permissions;
        (session.user as any).isHeadOffice = token.isHeadOffice;
        (session.user as any).district = token.district;
        (session.user as any).branch = token.branch;
        (session.user as any).assignedMerchantIds = token.assignedMerchantIds;
        (session.user as any).assignedMerchants = token.assignedMerchants;
        (session.user as any).firstLogin = token.firstLogin;
        (session.user as any).teamMemberId = token.teamMemberId;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session
    }
  },
  session: { 
    strategy: "jwt", 
    maxAge: 1800, // 30 minutes
    updateAge: 300, // Refresh session cookie every 5 minutes if active
  },
  pages: {
    signIn: "/login"
  }
})
