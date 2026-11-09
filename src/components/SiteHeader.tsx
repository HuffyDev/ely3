"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const LINKS = [
  { href: "/scan", label: "Scan" },
  { href: "/disclosures", label: "Disclosures" },
  { href: "/research", label: "Research" },
  { href: "/bounties", label: "Bounties" },
  { href: "/docs", label: "Docs" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="container inner">
        <Link href="/" className="wordmark" aria-label="WHITEHAT home">
          <span className="dot" aria-hidden /> WHITEHAT
        </Link>
        <nav className="nav" aria-label="Primary">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? "active" : ""}>
              {l.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
