import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parking Management System",
  description: "Standalone parking operations, ticketing, tariffs, payments and reporting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
