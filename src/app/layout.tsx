import type {Metadata} from 'next';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { SessionWatcher } from "@/components/session-watcher";
import { headers } from "next/headers";
import { NonceProvider } from "@/components/nonce-provider";

export const metadata: Metadata = {
  title: 'NibTeraMerchant APP',
  description: 'Secure Payment Gateway',
  icons: {
    icon: '/niblogo.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
