import type { Metadata, Viewport } from "next";
import { AppFooter } from "@/components/app-footer";
import { PwaRegistration } from "@/components/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Förena",
  description: "Den öppna plattformen för föreningslivet",
  applicationName: "Förena",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#173f35",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>
        <PwaRegistration />
        <div className="app-page">{children}</div>
        <AppFooter />
      </body>
    </html>
  );
}
