import type { Metadata, Viewport } from "next";
import { AppFooter } from "@/components/app-footer";
import { AppUpdateNotice } from "@/components/app-update-notice";
import { PwaRegistration } from "@/components/pwa-registration";
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/newsreader/index.css";
import "./ui-styles.css";

export const metadata: Metadata = {
  title: "Förena",
  description: "Den öppna plattformen för föreningslivet",
  applicationName: "Förena",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#1e3f20",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv">
      <body>
        <PwaRegistration />
        <AppUpdateNotice />
        <div className="app-page">{children}</div>
        <AppFooter />
      </body>
    </html>
  );
}
