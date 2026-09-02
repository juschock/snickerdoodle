import type { Metadata } from 'next';
import Link from 'next/link';
import { ManagerQueue } from '@/components/manager-queue';
import { PRODUCT_NAME } from '@/lib/site';
import { readPublicSupabaseConfig } from '@/lib/supabase-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: `Manager queue | ${PRODUCT_NAME}`,
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer'
};

export default function ManagerQueuePage() {
  // Validate before passing anything into the client component. This prevents a
  // mistyped service-role/secret key or credential-bearing URL from being
  // serialized into the browser response.
  const publicConfig = readPublicSupabaseConfig(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div className="min-h-screen bg-secondary/30 px-4 py-10 sm:px-6">
      <main id="main-content" className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="font-heading text-xl font-semibold text-foreground">{PRODUCT_NAME} operations</p>
          <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="/">
            Return to product site
          </Link>
        </div>
        <ManagerQueue
          supabaseUrl={publicConfig?.url ?? null}
          supabaseAnonKey={publicConfig?.anonKey ?? null}
        />
      </main>
    </div>
  );
}
