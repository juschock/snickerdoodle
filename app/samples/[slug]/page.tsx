import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SampleKitPreview } from '@/components/sample-kit-preview';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { readPageCommercialReadiness } from '@/lib/commercial-runtime';
import { publicSampleKits, getPublicSampleKit, sampleKitTitle } from '@/lib/sample-kits';
import { PRODUCT_NAME, publicUrl } from '@/lib/site';

type PageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return publicSampleKits.map((kit) => ({
    slug: kit.slug
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = sampleKitTitle(slug);
  const description = `Preview a fictional ${PRODUCT_NAME} sample campaign package.`;
  const url = publicUrl(`/samples/${slug}`);

  return {
    title: `${title} sample`,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} sample | ${PRODUCT_NAME}`, description, url }
  };
}

export default async function SampleKitPage({ params }: PageProps) {
  const { slug } = await params;
  const kit = getPublicSampleKit(slug);

  if (!kit) {
    notFound();
  }
  const commercialReady = await readPageCommercialReadiness();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader commercialReady={commercialReady} />
      <main id="main-content" className="flex-1">
        <SampleKitPreview kit={kit} />
      </main>
      <SiteFooter commercialReady={commercialReady} />
    </div>
  );
}
