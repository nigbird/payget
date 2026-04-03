import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/app/lib/db"
import bcrypt from "bcryptjs"

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
        
        const isValid = await bcrypt.compare(credentials.password as string, user.password)
        if (!isValid) return null
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          merchantId: user.merchantId
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
      }
      if (trigger === "update" && session) {
        // Update token with new session data
        if (session.user?.email) token.email = session.user.email;
        if (session.user?.name) token.name = session.user.name;
        if (session.user?.role) token.role = session.user.role;
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        (session.user as any).role = token.role;
        (session.user as any).id = token.id;
        (session.user as any).merchantId = token.merchantId;
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
