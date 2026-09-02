'use client';

import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { PUBLIC_PREFIX, SITE_ORIGIN } from '@/lib/site';

const PRIVATE_BRIEF_ROOTS = ['/brief', `${PUBLIC_PREFIX}/brief`];

function isPrivateBriefPath(pathname: string): boolean {
  return PRIVATE_BRIEF_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export function filterAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(event.url, SITE_ORIGIN);
  if (
    isPrivateBriefPath(url.pathname) ||
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
  return <Analytics beforeSend={filterAnalyticsEvent} />;
}
