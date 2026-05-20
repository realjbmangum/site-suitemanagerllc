import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Suite Manager Document Portal
// Deploys to app.suitemanagerllc.com (Cloudflare Pages, server output).
export default defineConfig({
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: 'compile',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
