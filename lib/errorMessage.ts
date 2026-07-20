/**
 * Convex wraps a thrown Error in transport noise before it reaches the client:
 *
 *   [CONVEX M(communityDayLabels:createLabel)] [Request ID: 7d36cd…] Server
 *   Error Uncaught Error: Give the day label a name.
 *   at handler (../../convex/communityDayLabels.ts:187:21) Called by client
 *
 * Showing that verbatim leaks file paths and request ids at the user. This
 * pulls out just the sentence the mutation actually threw.
 */
export function toUserMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again."
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!raw.trim()) return fallback;

  // The thrown message sits between "Uncaught <Type>Error:" and the stack.
  const thrown = /Uncaught\s+(?:\w*Error):\s*([\s\S]*?)(?:\n|\s+at\s+\w+\s*\(|$)/.exec(
    raw
  );

  const message = (thrown?.[1] ?? raw)
    // Strip any wrapper prefixes left over when the shape differs.
    .replace(/\[CONVEX[^\]]*\]/g, "")
    .replace(/\[Request ID:[^\]]*\]/g, "")
    .replace(/^\s*Server Error\s*/i, "")
    .replace(/\s*Called by client\s*$/i, "")
    .trim();

  // A bare stack frame or an empty remainder is worse than the fallback.
  if (!message || message.startsWith("at ")) return fallback;
  return message;
}
