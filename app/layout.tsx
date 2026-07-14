import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "OrthoFluoro Lab";
const description =
  "Explore how 3D positioning changes simplified fluoroscopic projections";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const incomingHost =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const safeHost = /^[a-z0-9.-]+(?::\d+)?$/i.test(incomingHost)
    ? incomingHost
    : "localhost:3000";
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : safeHost.startsWith("localhost")
        ? "http"
        : "https";
  const metadataBase = new URL(`${protocol}://${safeHost}`);
  const previewImage = new URL("/og.png", metadataBase).href;

  return {
    title,
    description,
    metadataBase,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title,
      description,
      images: [
        { alt: "OrthoFluoro Lab projection geometry", url: previewImage },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [previewImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
