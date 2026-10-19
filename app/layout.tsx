import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";
import HydrationSuppressor from "./_components/HydrationSuppressor";

export const metadata: Metadata = {
  title: "Parking Management System",
  description: "Standalone parking operations, ticketing, tariffs, payments and reporting",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <Script
          id="strip-bis-skin-checked"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var remove = function() {
                    var els = document.querySelectorAll('[bis_skin_checked]');
                    for (var i = 0; i < els.length; i++) {
                      els[i].removeAttribute('bis_skin_checked');
                    }
                  };
                  remove();
                  new MutationObserver(remove).observe(document.documentElement, {
                    attributes: true,
                    attributeFilter: ['bis_skin_checked'],
                    childList: true,
                    subtree: true
                  });
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        <HydrationSuppressor />
        {children}
      </body>
    </html>
  );
}
