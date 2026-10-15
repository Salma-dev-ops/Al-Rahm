import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AppNav, NavBar } from "@/components/AppNav";
import { AuthProvider } from "@/components/AuthProvider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: { default: "Al-Rahm: Women's health AI safety", template: "%s · Al-Rahm" },
  description:
    "Test whether AI health chatbots give safe answers to women's health questions, and see exactly where they fail.",
  applicationName: "Al-Rahm",
  appleWebApp: { capable: true, title: "Al-Rahm", statusBarStyle: "default" },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1c191b" },
  ],
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the inline script may set data-theme on <html> before React hydrates.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {/* usePathname can suspend on dynamic routes; render the bar without highlights meanwhile. */}
        <AuthProvider>
          <Suspense fallback={<NavBar pathname={null} />}>
            <AppNav />
          </Suspense>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 md:pb-10">{children}</main>
        </AuthProvider>
        <footer className="mx-auto hidden w-full max-w-6xl px-4 pb-8 text-xs text-muted md:block">
          Al-Rahm is a research tool, not medical advice. The questions and checks still need review by qualified
          clinicians.
        </footer>
      </body>
    </html>
  );
}
