'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { usePathname } from 'next/navigation';
import { PUBLIC_PREFIX, SITE_ORIGIN } from '@/lib/site';

const PRIVATE_PATH_ROOTS = ['/brief', '/checkout', '/manager', '/auth']
  .flatMap((root) => [root, `${PUBLIC_PREFIX}${root}`]);

export function isPrivateAnalyticsPath(pathname: string): boolean {
  return PRIVATE_PATH_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url, SITE_ORIGIN);
  if (
    isPrivateAnalyticsPath(url.pathname) ||
    url.searchParams.has('access') ||
    new URLSearchParams(url.hash.slice(1)).has('access')
  ) {
    return null;
  }
  url.search = '';
  url.hash = '';
  return { ...event, url: url.toString() };
}

export function SafeAnalytics() {
  const pathname = usePathname();
  if (isPrivateAnalyticsPath(pathname)) return null;
  return <Analytics beforeSend={filterAnalyticsEvent} />;
}
