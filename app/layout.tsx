import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://kevin6.com"),
  title: { default: "Kevin6 Toolbox", template: "%s — Kevin6 Toolbox" },
  description: "A collection of small, local-first tools for images, files and everyday work.",
  openGraph: {
    title: "Kevin6 Toolbox — Choose a tool. Get it done.",
    description: "Search and filter private, focused browser tools at kevin6.com/toolbox.",
    url: "https://kevin6.com/toolbox/",
    siteName: "Kevin6 Toolbox",
    images: [{ url: "/toolbox/og.png", width: 1792, height: 1024, alt: "Kevin6 Toolbox — Choose a tool. Get it done." }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kevin6 Toolbox",
    description: "Choose a tool. Get it done.",
    images: ["/toolbox/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
