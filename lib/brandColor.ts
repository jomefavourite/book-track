/**
 * Turns a community's brand color (#RRGGBB) into a set of theme values that
 * stay readable in both light and dark mode. Alpha tints are used for soft
 * backgrounds so they blend with either page background.
 */

export type BrandTheme = {
  /** Solid brand color, e.g. buttons and progress fills */
  brand: string;
  /** Text color that passes contrast on top of `brand` */
  brandForeground: string;
  /** Low-alpha tint for banners and badge backgrounds */
  brandSoft: string;
  /** Mid-alpha tint for borders and rings */
  brandBorder: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (
    0.2126 * channelLuminance(rgb.r) +
    0.7152 * channelLuminance(rgb.g) +
    0.0722 * channelLuminance(rgb.b)
  );
}

export function getBrandTheme(hex: string | undefined): BrandTheme | null {
  if (!hex) return null;
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const luminance = relativeLuminance(rgb);
  // White text passes 4.5:1 when (L + 0.05) * 4.5 <= 1.05
  const brandForeground = luminance > 0.183 ? "#111111" : "#ffffff";
  const { r, g, b } = rgb;

  return {
    brand: hex,
    brandForeground,
    brandSoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    brandBorder: `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

/**
 * CSS custom properties for a brand theme, ready to spread into a `style`
 * prop. Components consume them as `var(--brand)` etc. and should provide
 * fallbacks for communities without a brand color.
 */
export function getBrandCssVars(
  hex: string | undefined
): Record<string, string> {
  const theme = getBrandTheme(hex);
  if (!theme) return {};
  return {
    "--brand": theme.brand,
    "--brand-foreground": theme.brandForeground,
    "--brand-soft": theme.brandSoft,
    "--brand-border": theme.brandBorder,
  };
}
