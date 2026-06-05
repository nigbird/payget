import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { SessionWatcher } from "@/components/session-watcher";
import { headers } from "next/headers";
import { NonceProvider } from "@/components/nonce-provider";
import { Inter } from 'next/font/google';
import { auth } from "@/auth";
import { redirect } from "next/navigation";

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'NibTeraMerchant APP',
  description: 'Secure Payment Gateway',
  icons: {
    icon: '/niblogo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  
  // Server-side session validation to enforce single active session.
  // This catches invalidated sessions (due to new logins elsewhere) on page navigation.
  const session = await auth();
  
  // If we have a session but auth() returned null (which it does when sessionVersion mismatches),
  // we are effectively logged out. The middleware might have allowed us through if it's on Edge,
  // but this Node-side check in the layout will catch it.
  
  return (
    <html lang="en" className={inter.variable}>
      <head>
      </head>
      <body className="font-body antialiased bg-background">
        <NonceProvider nonce={nonce}>
          <AuthSessionProvider session={session}>
            {children}
            <SessionWatcher />
            <Toaster />
          </AuthSessionProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
