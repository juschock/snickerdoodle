import type { MetadataRoute } from 'next';
import { publicUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/snickerdoodle/brief',
        '/snickerdoodle/checkout',
        '/snickerdoodle/manager',
        '/snickerdoodle/auth',
        '/snickerdoodle/api'
      ]
    },
    sitemap: publicUrl('/sitemap.xml')
  };
}
