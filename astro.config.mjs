import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
// Note: React removed due to Cloudflare Workers MessageChannel incompatibility
// Using vanilla JS in Astro components instead
export default defineConfig({
  output: 'server',
  // Base path - app lives at zoheri.com/vig/
  base: '/vig',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },
  }),
  integrations: [
    tailwind(),
  ],
});
