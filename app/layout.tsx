import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sri Siva Durga Temple",
  description: "Sri Siva Durga Temple — Admin Panel",
  icons: { icon: "/favicon.webp" },
};

// Plain <link> tags rather than next/font/google — globals.css's @theme
// block references "Playfair Display"/"Inter" by literal family name
// (--font-display, --font-body, --font-accent), the same way the Vite app
// did via index.html. next/font would mean restructuring those tokens
// around its generated CSS-variable classes; not worth it for a straight
// port with no other reason to prefer it.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700;800&family=Inter:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* suppressHydrationWarning: Bitdefender's browser extension (and
          several similar security/anti-tracker extensions) injects a
          `bis_skin_checked` attribute onto elements in the live DOM before
          React hydrates — that's an extension modifying the page, not a
          real server/client markup mismatch in this app (see
          https://nextjs.org/docs/messages/react-hydration-error, which
          names browser extensions as a known cause). This only silences
          the warning for attributes on <body> itself; it's the standard,
          narrowly-scoped mitigation rather than suppressing hydration
          warnings tree-wide. */}
      <body className="h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
