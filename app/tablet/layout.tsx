import type { Metadata, Viewport } from "next";
import SwRegister from "./SwRegister";

export const metadata: Metadata = {
  title: "Race Room",
  description: "Panel de sesión — Race Room",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Race Room",
  },
  icons: {
    apple: "/icons/icon-192.png",
    icon: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0A0A0C",
};

export default function TabletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SwRegister />
      {children}
    </>
  );
}
