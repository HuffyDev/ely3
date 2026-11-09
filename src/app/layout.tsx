import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "WHITEHAT — on-chain exposure reports for Elysium",
  description:
    "One security report for any Elysium contract or wallet: smart-contract breach risk, quantum readiness and wallet privacy. Findings are proven on a private fork before they are called confirmed.",
  metadataBase: new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000"),
  openGraph: {
    title: "WHITEHAT",
    description: "Everything on-chain is exposed. See where.",
    type: "website",
  },
};

const themeScript = `(function(){try{var t=localStorage.getItem('wh-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="container stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="wordmark">
              <span className="dot" aria-hidden /> WHITEHAT
            </div>
            <p className="measure" style={{ maxWidth: "62ch" }}>
              WHITEHAT analyses contracts and wallets with read-only data and private local forks. It never sends a
              transaction to any live network, never publishes working exploit code, and never claims a contract is safe.
              It is not an audit.
            </p>
            <p className="faint" style={{ fontSize: "0.82rem" }}>
              Defensive security tooling. You run disclosures, bounties and any coin launch yourself — the software does
              not move funds.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
