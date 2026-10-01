import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Nav } from "@/components/Nav";
import { NavigationGuardProvider } from "@/components/NavigationGuard";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ShotListr", template: "%s · ShotListr" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NavigationGuardProvider>
          <Nav />
          <main className="flex flex-1 flex-col">{children}</main>
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
