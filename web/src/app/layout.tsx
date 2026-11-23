import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import "./globals.css";

import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "CareSlot · Book doctors near you", template: "%s · CareSlot" },
  description: "Book a visit with private-practice doctors at their home clinics. Confirmations and reminders on WhatsApp.",
  applicationName: "CareSlot",
  // Installed on an iPhone or iPad: opens full screen with its own name under the icon.
  appleWebApp: { capable: true, title: "CareSlot", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the installed app use the whole screen; bars pad themselves around the notch and home bar.
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
