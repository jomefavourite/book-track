"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home, Plus, User, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getNavItems,
  isNavItemActive,
  type NavKey,
} from "@/components/navItems";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  discover: Compass,
  communities: Users,
  profile: User,
};

/**
 * Bottom tab bar shown on small screens for signed-in users. Rendered by
 * <Navigation />, so every page that has the header also gets the tabs.
 * The `data-mobile-tabbar` attribute drives the body padding / toast offset
 * in globals.css so page content never sits underneath the bar.
 */
export default function MobileTabBar({
  profileHref,
  activeNav,
}: {
  profileHref: string;
  activeNav?: NavKey | null;
}) {
  const pathname = usePathname() ?? "/";
  const items = getNavItems(profileHref);
  const addActive = pathname === "/books/new";

  const renderTab = (item: (typeof items)[number]) => {
    const Icon = ICONS[item.key];
    const active = isNavItemActive(item, pathname, profileHref, activeNav);
    return (
      <li key={item.key} className="flex-1">
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors",
            active
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span
            className={cn(
              "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
              active ? "bg-foreground/10" : "group-active:bg-foreground/5"
            )}
          >
            <Icon
              className="h-[18px] w-[18px]"
              strokeWidth={active ? 2.4 : 2}
            />
          </span>
          <span className="leading-none">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      data-mobile-tabbar=""
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-lg supports-[backdrop-filter]:bg-background/75 md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-16 max-w-md items-stretch px-2 py-1.5">
        {items.slice(0, 2).map(renderTab)}
        <li className="flex flex-1 items-center justify-center">
          <Link
            href="/books/new"
            aria-label="Add a book"
            aria-current={addActive ? "page" : undefined}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-black/10 transition-transform active:scale-95 dark:shadow-black/40",
              addActive && "ring-2 ring-ring ring-offset-2 ring-offset-background"
            )}
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </li>
        {items.slice(2).map(renderTab)}
      </ul>
    </nav>
  );
}
