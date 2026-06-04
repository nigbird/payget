import type {Metadata, Viewport} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { SessionWatcher } from "@/components/session-watcher";
import { headers } from "next/headers";
import { NonceProvider } from "@/components/nonce-provider";
import { Inter } from 'next/font/google';

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

  return (
    <html lang="en" className={inter.variable}>
      <head>
      </head>
      <body className="font-body antialiased bg-background">
        <NonceProvider nonce={nonce}>
          <AuthSessionProvider>
            {children}
            <SessionWatcher />
            <Toaster />
          </AuthSessionProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
