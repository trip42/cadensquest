/* PostHog, wired to the game's event stream.

   Configured from runtime config, so the key lives in `.env` rather than the
   source: NUXT_PUBLIC_POSTHOG_KEY, and NUXT_PUBLIC_POSTHOG_HOST for an EU
   project. With no key nothing is sent.

   In development events are printed to the console instead, so testing does
   not fill the real project with junk runs. Set NUXT_PUBLIC_POSTHOG_DEV=1 to
   send from dev as well — useful for checking the pipeline end to end. */

import posthog from 'posthog-js';
import { setAnalyticsSink } from '~/utils/analytics';

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig().public;
  const key = String(config.posthogKey ?? '');
  const sendFromDev = ['1', 'true'].includes(String(config.posthogDev ?? ''));

  if (import.meta.dev && !sendFromDev) {
    setAnalyticsSink((event, properties) => console.debug('[analytics]', event, properties));
    return;
  }
  if (!key) return;

  posthog.init(key, {
    api_host: String(config.posthogHost || 'https://us.i.posthog.com'),
    // PostHog's versioned defaults, as its setup suggested. The options
    // below are stated explicitly and win over whatever those defaults are.
    defaults: '2026-05-30',
    // Only the game's own events. Clicks on a canvas say nothing useful,
    // and session replay cannot see what is drawn on one.
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    // No survey popups over the game; also skips downloading surveys.js.
    disable_surveys: true,
    // Anonymous players: no person profiles unless we identify someone.
    person_profiles: 'identified_only',
    persistence: 'localStorage',
  });

  setAnalyticsSink((event, properties) => posthog.capture(event, properties));
});
