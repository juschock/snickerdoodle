import type { MetadataRoute } from 'next';
import { publicUrl } from '@/lib/site';

const routes = [
  '/',
  '/faq',
  '/privacy',
  '/terms',
  '/samples',
  '/samples/adoption-event',
  '/samples/year-end-appeal',
  '/samples/restaurant-local-discovery'
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    url: publicUrl(route),
    changeFrequency: 'monthly',
    priority: route === '/' ? 0.9 : 0.7
  }));
}
