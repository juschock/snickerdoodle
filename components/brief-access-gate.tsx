'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BriefForm } from '@/components/brief-form';
import { Button } from '@/components/ui/button';
import { FIT_CHECK_CTA, FIT_CHECK_MAILTO, PUBLIC_PREFIX } from '@/lib/site';

type AccessState = 'checking' | 'missing';

function removeAccessFragment() {
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(window.history.state, '', cleanUrl);
}

export function BriefAccessGate({ hasAccess }: { hasAccess: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<AccessState>('checking');

  useEffect(() => {
    if (hasAccess) {
      if (window.location.hash) removeAccessFragment();
      return;
    }

    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get('access');
    if (!token || token.length > 1_024) {
      if (window.location.hash) removeAccessFragment();
      const frame = window.requestAnimationFrame(() => setState('missing'));
      return () => window.cancelAnimationFrame(frame);
    }

    removeAccessFragment();
    const controller = new AbortController();
    void fetch(`${PUBLIC_PREFIX}/api/brief-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal
    }).then((response) => {
      if (!response.ok) throw new Error('invite_rejected');
      router.refresh();
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setState('missing');
    });

    return () => controller.abort();
  }, [hasAccess, router]);

  if (hasAccess) return <BriefForm />;
  if (state === 'checking') {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8" aria-live="polite">
        <h2 className="font-heading text-2xl font-semibold text-foreground">Checking your private invite</h2>
        <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">
          One moment while we open the qualified-project survey.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
      <h2 className="font-heading text-2xl font-semibold text-foreground">A private invite is required</h2>
      <p className="mx-auto mt-3 max-w-xl leading-relaxed text-muted-foreground">
        This survey is available after a fit check. If an invite expired or was opened with the link cut off,
        request a fresh private link.
      </p>
      <Button className="mt-6" nativeButton={false} render={<a href={FIT_CHECK_MAILTO}>{FIT_CHECK_CTA}</a>} />
    </div>
  );
}
