export default defineNuxtConfig({
  // A canvas game: there is nothing useful to render on a server, and
  // hydration would only get in the way. Nitro is still here for the card
  // and map endpoints under server/api.
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
  runtimeConfig: {
    public: {
      posthogKey: '',
      posthogHost: 'https://us.i.posthog.com',
      posthogDev: '',
    },
  },
});
