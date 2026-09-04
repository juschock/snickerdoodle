import { describe, expect, it } from 'vitest';
import { filterAnalyticsEvent, isPrivateAnalyticsPath } from '@/components/safe-analytics';
import { readAnalyticsEnabled } from '@/lib/analytics-runtime';

describe('analytics privacy boundary', () => {
  it('does not mount provider analytics unless an explicit server-owned production flag is true', () => {
    expect(readAnalyticsEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(readAnalyticsEnabled({
      NODE_ENV: 'production',
      SNICKERDOODLE_ANALYTICS_ENABLED: 'false'
    })).toBe(false);
    expect(readAnalyticsEnabled({
      NODE_ENV: 'development',
      SNICKERDOODLE_ANALYTICS_ENABLED: 'true'
    })).toBe(false);
    expect(readAnalyticsEnabled({
      NODE_ENV: 'production',
      SNICKERDOODLE_ANALYTICS_ENABLED: 'true'
    })).toBe(true);
  });

  it('drops private brief, checkout, manager, auth, and bearer-carrying events', () => {
    for (const path of [
      '/brief',
      '/checkout/success',
      '/manager/queue',
      '/auth/recovery',
      '/snickerdoodle/brief',
      '/snickerdoodle/checkout/cancel',
      '/snickerdoodle/manager/queue',
      '/snickerdoodle/auth/recovery'
    ]) expect(isPrivateAnalyticsPath(path)).toBe(true);
    expect(isPrivateAnalyticsPath('/snickerdoodle/briefing')).toBe(false);
    expect(isPrivateAnalyticsPath('/snickerdoodle/managerial')).toBe(false);

    expect(filterAnalyticsEvent({ type: 'pageview', url: 'https://racoben.com/snickerdoodle/brief' })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/brief/received'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/brief/received'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/checkout/success?session_id=private'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/checkout/cancel'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/manager/queue'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/manager/queue'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/auth/recovery'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/brief#access=secret'
    })).toBeNull();
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle?access=secret'
    })).toBeNull();
  });

  it('removes all query and fragment data from allowed analytics events', () => {
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/briefing'
    })).toEqual({ type: 'pageview', url: 'https://racoben.com/snickerdoodle/briefing' });
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/managerial'
    })).toEqual({ type: 'pageview', url: 'https://racoben.com/snickerdoodle/managerial' });
    expect(filterAnalyticsEvent({
      type: 'pageview',
      url: 'https://racoben.com/snickerdoodle/samples?utm_source=test#section'
    })).toEqual({ type: 'pageview', url: 'https://racoben.com/snickerdoodle/samples' });
  });
});
