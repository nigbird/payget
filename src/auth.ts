import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/app/lib/db"
import bcrypt from "bcryptjs"
import { verifySalesOtp } from "@/lib/otp"

function normalizeLoginIdentifier(value: string) {
  const v = value.trim()
  if (v.includes("@")) return v.toLowerCase()
  return v.replace(/[\s\-\(\)]/g, "")
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
        if (!credentials?.email || !credentials?.password) return null

        const identifier = String(credentials.email).trim()
        const loginType = String(credentials.loginType || "")

        let user = await db.findUserByEmail(identifier)

        // Fallback: allow merchant login by contact username (email or phone).
        if (!user) {
          const merchant = await db.findMerchantByIdentifier(identifier)
          if (merchant?.id) {
            user = await db.findMerchantUserByMerchantId(merchant.id)
          }
        }

        if (!user || !user.password) return null
        
        // Role-based validation
        if (loginType === "admin") {
          const adminRoles = ['ADMIN', 'MAKER', 'CHECKER', 'HEAD_OFFICE']
          if (!adminRoles.includes(user.role)) {
            throw new Error("AccessDenied: Not an admin user")
          }
        } else if (loginType === "merchant") {
          if (user.role !== 'MERCHANT') {
            throw new Error("AccessDenied: Not a merchant user")
          }
        }

        // If the user is a merchant, ensure the merchant account is ACTIVE
        if (user.role === 'MERCHANT' && user.merchantId) {
          if (user.merchant?.status !== 'ACTIVE') {
            return null; // Deny login for inactive/pending merchants
          }

          // Merchant login must match the current configured username only.
          const currentUsername = user.merchant?.contactUsername
          if (!currentUsername) return null
          const provided = normalizeLoginIdentifier(identifier)
          const expected = normalizeLoginIdentifier(currentUsername)
          if (provided !== expected) return null
        }
        
        const isValid = await bcrypt.compare(credentials.password as string, user.password)
        if (!isValid) return null
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          merchantId: user.merchantId,
          isHeadOffice: user.isHeadOffice,
          district: user.district,
          branch: user.branch,
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
        
        if (!phone || !otp) return null

        if (!verifySalesOtp(phone, otp)) return null

        const members = (await db.findMerchantTeamMembersByPhone(phone)) as any[]
        const activeMembers = members.filter(
          (member) =>
            member.status === 'ACTIVE' &&
            member.merchant &&
            member.merchant.status === 'ACTIVE'
        )

        if (activeMembers.length === 0) {
          return null
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

        return {
          id: `sales-${phone}`,
          email: selectedMember.email,
          name: selectedMember.name,
          role: 'SALES',
          merchantId: selectedMember.merchantId,
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
