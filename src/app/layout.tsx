import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The CutList",
  description: "A verified collaborative playlist curator."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
