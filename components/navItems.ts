export type NavKey = "home" | "discover" | "communities" | "profile";

export type NavItem = {
  key: NavKey;
  label: string;
  href: string;
};

/** Primary destinations shared by the desktop header and the mobile tab bar. */
export function getNavItems(profileHref: string): NavItem[] {
  return [
    { key: "home", label: "Home", href: "/dashboard" },
    { key: "discover", label: "Discover", href: "/public" },
    { key: "communities", label: "Communities", href: "/communities" },
    { key: "profile", label: "Profile", href: profileHref },
  ];
}

/**
 * `activeOverride` lets a page decide when the path alone can't, e.g. another
 * reader's book at /books/<id> belongs under Discover, not Home. `undefined`
 * means "work it out from the path"; `null` means "highlight nothing".
 */
export function isNavItemActive(
  item: NavItem,
  pathname: string,
  profileHref: string,
  activeOverride?: NavKey | null
): boolean {
  if (activeOverride !== undefined) return item.key === activeOverride;
  switch (item.key) {
    case "home":
      // Personal books live under /books; /books/new has its own "Add" tab.
      return (
        pathname === "/dashboard" ||
        (pathname.startsWith("/books/") && pathname !== "/books/new")
      );
    case "discover":
      return pathname === "/public" || pathname.startsWith("/public/");
    case "communities":
      return (
        pathname === "/communities" ||
        pathname.startsWith("/communities/") ||
        pathname.startsWith("/join/")
      );
    case "profile":
      return (
        (profileHref !== "#" && pathname === profileHref) ||
        pathname.startsWith("/dashboard/settings")
      );
  }
}
