import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SafeAnalytics } from '@/components/safe-analytics';
import { readAnalyticsEnabled } from '@/lib/analytics-runtime';
import { PARENT_BRAND, PRODUCT_META_DESCRIPTION, PRODUCT_NAME, TAGLINE, publicUrl } from '@/lib/site';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
});

export const metadata: Metadata = {
  metadataBase: new URL(publicUrl('/')),
  title: {
    default: `${PRODUCT_NAME} by ${PARENT_BRAND} — ${TAGLINE}`,
    template: `%s | ${PRODUCT_NAME}`
  },
  description: PRODUCT_META_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: PRODUCT_NAME,
    title: `${PRODUCT_NAME} by ${PARENT_BRAND} — ${TAGLINE}`,
    description: PRODUCT_META_DESCRIPTION
  },
  twitter: {
    card: 'summary',
    title: `${PRODUCT_NAME} by ${PARENT_BRAND} — ${TAGLINE}`,
    description: PRODUCT_META_DESCRIPTION
  }
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#faf6ef'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`light ${geistSans.variable} ${geistMono.variable} ${fraunces.variable} bg-background`}
    >
      <head>
        <link rel="icon" href="/snickerdoodle/icon.svg" type="image/svg+xml" />
      </head>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform focus:translate-y-0"
        >
          Skip to main content
        </a>
        {children}
        {readAnalyticsEnabled() ? <SafeAnalytics /> : null}
      </body>
    </html>
  );
}
