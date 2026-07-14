import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrthoFluoro Lab",
  description:
    "Explore how 3D positioning changes simplified fluoroscopic projections",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
