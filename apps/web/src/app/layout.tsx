import type { ReactNode } from "react";
import {
  APPEARANCE_BOOT_SCRIPT,
  DEFAULT_DENSITY,
  DEFAULT_THEME,
} from "@/lib/appearance";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html
      lang="en"
      data-theme={DEFAULT_THEME}
      data-density={DEFAULT_DENSITY}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Source+Sans+3:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
