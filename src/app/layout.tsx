import type { Metadata, Viewport } from "next";
import {
  Be_Vietnam_Pro,
  Oswald,
  Shantell_Sans,
  Space_Grotesk,
  JetBrains_Mono,
} from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import ThemeSwitcher from "@/components/theme/theme-switcher";
import { ThemeApplier } from "@/components/theme/theme-applier";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const shantellSans = Shantell_Sans({
  variable: "--font-shantell",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Công an xã — Hệ thống quản lý hàng đợi",
  description: "Hệ thống quản lý hàng đợi và thủ tục hành chính tại Công an xã",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      suppressHydrationWarning
      className={`${beVietnamPro.variable} ${oswald.variable} ${shantellSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="doodle"
          themes={["doodle", "chinh-quy", "riso", "glass", "bca"]}
          storageKey="bamso-theme"
          enableSystem={false}
          enableColorScheme={false}
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
          <ThemeSwitcher />
          <ThemeApplier />
        </ThemeProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
