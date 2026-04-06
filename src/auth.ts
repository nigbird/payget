import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/app/lib/db"
import bcrypt from "bcryptjs"
import { verifySalesOtp } from "@/lib/otp"

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null
        
        const user = await db.findUserByEmail(credentials.email as string)
        if (!user || !user.password) return null
        
        // If the user is a merchant, ensure the merchant account is ACTIVE
        if (user.role === 'MERCHANT' && user.merchantId) {
          if (user.merchant?.status !== 'ACTIVE') {
            return null; // Deny login for inactive/pending merchants
          }
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
        otp: { label: "OTP", type: "text" }
      },
      authorize: async (credentials) => {
        const phone = credentials?.phone?.trim()
        const otp = credentials?.otp?.trim()
        if (!phone || !otp) return null

        if (!verifySalesOtp(phone, otp)) return null

        const teamMember = await db.findMerchantTeamMemberByPhone(phone)
        if (!teamMember || teamMember.status !== 'ACTIVE' || !teamMember.merchant || teamMember.merchant.status !== 'ACTIVE') {
          return null
        }

        return {
          id: `sales-${teamMember.id}`,
          email: teamMember.email,
          name: teamMember.name,
          role: 'SALES',
          merchantId: teamMember.merchantId,
          permissions: []
        }
      }
    })
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = (user as any).role
        token.merchantId = (user as any).merchantId
        token.id = user.id
        token.permissions = (user as any).permissions
        token.isHeadOffice = (user as any).isHeadOffice
        token.district = (user as any).district
        token.branch = (user as any).branch
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
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session
    }
  },
  session: { strategy: "jwt" },
  pages: {
    signIn: "/"
  }
})
