/**
 * Sabilytics analytics configuration.
 *
 * These values mirror the analytics script wired up in `app/layout.tsx`.
 * Keep them in sync if the site is ever migrated.
 */
export const SABILYTICS_SITE_ID = "uqzjfvo9vdmz";
export const SABILYTICS_BASE_URL = "https://sabilytics.vercel.app";

/** Public Live Room embed URL (country-level locations + recent page visits). */
export const LIVE_ROOM_EMBED_URL = `${SABILYTICS_BASE_URL}/embed/${SABILYTICS_SITE_ID}`;
