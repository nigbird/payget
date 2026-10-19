import type { Metadata, Viewport } from "next"

/**
 * The speaker installs as its own app ("Nibtera Speaker"), separate from the
 * merchant portal: its own manifest id, name and icon, and it opens straight
 * into /speaker rather than the portal's login page.
 */
export const metadata: Metadata = {
  title: "Nibtera Speaker",
  description: "Announces every payment your shop receives",
  manifest: "/speaker-manifest.json",
  icons: {
    icon: "/speaker-icon-192.png",
    apple: "/speaker-apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Nib Speaker",
    statusBarStyle: "default",
  },
}

export const viewport: Viewport = {
  themeColor: "#754319",
}

export default function SpeakerLayout({ children }: { children: React.ReactNode }) {
  return children
}
