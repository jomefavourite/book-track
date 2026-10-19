/**
 * Sabilytics analytics configuration.
 *
 * These values mirror the analytics script wired up in `app/layout.tsx`.
 * Keep them in sync if the site is ever migrated.
 */
export const SABILYTICS_SITE_ID = "uqzjfvo9vdmz";
export const SABILYTICS_BASE_URL = "https://www.sabilytics.com";

/** Public Live Room embed URL (country-level locations + recent page visits). */
export const LIVE_ROOM_EMBED_URL = `${SABILYTICS_BASE_URL}/embed/${SABILYTICS_SITE_ID}`;

type TrackProps = Record<string, string | number | boolean | null>;

declare global {
  interface Window {
    sabilytics?: { track?: (name: string, props?: TrackProps) => void };
  }
}

/**
 * Sends a Sabilytics custom event. If the script hasn't loaded yet (e.g. right
 * after a post-signup redirect), retries for up to ~5s before giving up.
 */
export function trackEvent(name: string, props?: TrackProps, attempt = 0) {
  if (typeof window === "undefined") return;
  const track = window.sabilytics?.track;
  if (!track) {
    if (attempt < 20) {
      window.setTimeout(() => trackEvent(name, props, attempt + 1), 250);
    }
    return;
  }
  try {
    track(name, props);
  } catch {
    // Analytics must never break the app.
  }
}

/** Reports a failed key action; the message is truncated to stay under Sabilytics' string limit. */
export function trackActionFailed(action: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  trackEvent("action_failed", { action, message: message.slice(0, 120) });
}
