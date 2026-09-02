import type { MetadataRoute } from 'next';
import { publicUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/snickerdoodle/brief', '/snickerdoodle/checkout'] },
    sitemap: publicUrl('/sitemap.xml')
  };
}
