import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Homeward | Self-Service Arbitrum Nova to Arbitrum One ETH Migration",
  description: "Self-service, trustless ETH migration application for Arbitrum Nova holders. Move ETH to Arbitrum One via canonical bridge with gas-advancing worker protection.",
  keywords: ["Arbitrum Nova", "Arbitrum One", "Ethereum", "ETH migration", "canonical bridge", "crypto"],
  openGraph: {
    title: "Homeward — Self-Service Arbitrum Nova Migration",
    description: "Move ETH from Arbitrum Nova to Arbitrum One safely via canonical bridge.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
