"use client";

import type { CSSProperties, ReactNode } from "react";
import { getBrandCssVars } from "@/lib/brandColor";

/**
 * Scopes a community's brand color as CSS variables so children can use
 * `var(--brand)`, `var(--brand-foreground)`, `var(--brand-soft)` and
 * `var(--brand-border)`. Falls back to the app theme when no brand color is
 * set, so consumers can style unconditionally.
 */
export default function CommunityThemeProvider({
  brandColor,
  children,
  className,
}: {
  brandColor?: string;
  children: ReactNode;
  className?: string;
}) {
  const vars = getBrandCssVars(brandColor);
  const style: CSSProperties = {
    "--brand": "var(--primary)",
    "--brand-foreground": "var(--primary-foreground)",
    "--brand-soft": "var(--accent)",
    "--brand-border": "var(--border)",
    ...vars,
  } as CSSProperties;

  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
