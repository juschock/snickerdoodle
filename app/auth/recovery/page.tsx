import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerPasswordRecovery } from '@/components/owner-password-recovery';
import { PRODUCT_NAME } from '@/lib/site';
import { readPublicSupabaseConfig } from '@/lib/supabase-manager';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: `Owner password recovery | ${PRODUCT_NAME}`,
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer'
};

export default function OwnerPasswordRecoveryPage() {
  const publicConfig = readPublicSupabaseConfig(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return (
    <div className="min-h-screen bg-secondary/30 px-4 py-10 sm:px-6">
      <main id="main-content" className="mx-auto max-w-3xl">
        <div className="mb-5">
          <Link
            href="/manager/queue"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Return to owner sign-in
          </Link>
        </div>
        <OwnerPasswordRecovery
          supabaseUrl={publicConfig?.url ?? null}
          supabaseAnonKey={publicConfig?.anonKey ?? null}
        />
      </main>
    </div>
  );
}
