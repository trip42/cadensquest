import { fileURLToPath } from 'node:url';

const contentDir = fileURLToPath(new URL('./content', import.meta.url));

export default defineNuxtConfig({
  // A canvas game: there is nothing useful to render on a server, and
  // hydration would only get in the way. Nitro is still here to serve the
  // content files, and in dev to let the editor save them.
  ssr: false,
  modules: ['@pinia/nuxt'],
  // Self-hosted pixel face: Silkscreen, for everything, in capitals.
  css: [
    '@fontsource/silkscreen/400.css',
    '~/assets/css/main.css',
  ],
  devtools: { enabled: false },
  compatibilityDate: '2025-07-15',
  typescript: { strict: true },
  // Overridden from the environment: NUXT_PUBLIC_POSTHOG_KEY and friends.
  // The game's content — cards, enemies, gems, talismans — is JSON in
  // content/, served as static files at /content/*.json and loaded at boot.
  // Served rather than imported, so editing a file never hot-reloads the
  // page under the editor, and so the source can become a server later.
  nitro: {
    publicAssets: [{ dir: contentDir, baseURL: '/content', maxAge: 0 }],
  },
  // The content editor exists only in dev: it writes to the files above,
  // which a deployed build must never do.
  hooks: {
    'pages:extend'(pages) {
      if (process.env.NODE_ENV !== 'production') return;
      const at = pages.findIndex((page) => page.path === '/editor');
      if (at >= 0) pages.splice(at, 1);
    },
  },
  runtimeConfig: {
    public: {
      posthogKey: '',
      posthogHost: 'https://us.i.posthog.com',
      posthogDev: '',
    },
  },
});
