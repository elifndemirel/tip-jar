import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tip Jar — Stellar Testnet",
  description: "Decentralized tip jar built on Stellar Soroban",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
