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
      <body className="h-full">{children}</body>
    </html>
  );
}
