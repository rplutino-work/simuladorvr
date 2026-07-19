import type { Metadata } from "next";
import { Bebas_Neue, Barlow, Barlow_Condensed } from "next/font/google";
import { Providers } from "@/components/providers/session-provider";
import "./globals.css";

const bebasNeue = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const barlow = Barlow({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  weight: ["500", "600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://raceroom.com.ar"),
  title: {
    default: "Race Room — Simuladores de carreras",
    template: "%s · Race Room",
  },
  description:
    "Reservá tu sesión en los simuladores de carreras de Race Room. Elegí puesto, día y horario, y viví la experiencia de manejar como un profesional.",
  keywords: [
    "simulador de carreras",
    "race room",
    "simracing",
    "reservas",
    "Argentina",
  ],
  applicationName: "Race Room",
  icons: {
    icon: "/race-room-rr.png",
    apple: "/race-room-rr.png",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: "https://raceroom.com.ar",
    siteName: "Race Room",
    title: "Race Room — Simuladores de carreras",
    description:
      "Reservá tu sesión en los simuladores de carreras de Race Room. Elegí puesto, día y horario y corré como un profesional.",
    images: [
      {
        url: "/race-room-logo.png",
        width: 512,
        height: 512,
        alt: "Race Room",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Race Room — Simuladores de carreras",
    description:
      "Reservá tu sesión en los simuladores de carreras de Race Room.",
    images: ["/race-room-logo.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${bebasNeue.variable} ${barlow.variable} ${barlowCondensed.variable} antialiased font-barlow`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
