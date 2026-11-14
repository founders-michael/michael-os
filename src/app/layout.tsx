import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "sonner";
import QueryProvider from "@/components/query-provider";
import { siteUrlObject } from "@/lib/site-url";
import { AnimateUIProvider } from "@animate-ui/react/provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "MichaelOS";
const SITE_TITLE = "MichaelOS — Your AI planning assistant";
const SITE_DESCRIPTION =
  "Michael is an AI planning assistant grounded in your own data. It reads your saved tasks, goals, habits and calendar, then drafts the changes for you to review and save.";

export const metadata: Metadata = {
  metadataBase: siteUrlObject(),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans")}
    >
      <body className="min-h-full flex flex-col"><AnimateUIProvider tempo={1.1}><QueryProvider>{children}</QueryProvider></AnimateUIProvider><Toaster position="top-center" theme="system" richColors closeButton duration={4500} visibleToasts={4} className="michael-sonner-toaster" offset={24} mobileOffset={12} /></body>
    </html>
  );
}
