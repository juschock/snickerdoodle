import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SafeAnalytics } from '@/components/safe-analytics';
import { readAnalyticsEnabled } from '@/lib/analytics-runtime';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { PARENT_BRAND, PRODUCT_NAME, getProductMetadataMode, publicUrl } from '@/lib/site';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700']
});

export async function generateMetadata(): Promise<Metadata> {
  const commercialReady = await readPageCommercialReadiness();
  const { tagline, productDescription } = getProductMetadataMode(commercialReady);
  const title = `${PRODUCT_NAME} by ${PARENT_BRAND} — ${tagline}`;

  return {
    metadataBase: new URL(publicUrl('/')),
    title: {
      default: title,
      template: `%s | ${PRODUCT_NAME}`
    },
    description: productDescription,
    openGraph: {
      type: 'website',
      siteName: PRODUCT_NAME,
      title,
      description: productDescription
    },
    twitter: {
      card: 'summary',
      title,
      description: productDescription
    }
  };
}

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
