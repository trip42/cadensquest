/* Where game events go. The store calls `track`; the analytics plugin
   decides what that means by installing a sink. Nothing installed (tests,
   a missing key) means events are simply dropped — the game never waits on
   analytics and never fails because of it.

   Events tracked before the plugin has loaded are held briefly and flushed
   once a sink arrives, so `run_started` is not lost to start-up order. */

export type AnalyticsSink = (event: string, properties: Record<string, unknown>) => void;

let sink: AnalyticsSink | null = null;
const early: Array<[string, Record<string, unknown>]> = [];
const EARLY_LIMIT = 200;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
  if (!sink) return;
  for (const [event, properties] of early.splice(0)) sink(event, properties);
}

export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (sink) {
    sink(event, properties);
    return;
  }
  if (early.length < EARLY_LIMIT) early.push([event, properties]);
}
