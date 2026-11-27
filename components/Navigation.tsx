"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import {
  Bell,
  Check,
  Compass,
  Home,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import MobileTabBar from "@/components/MobileTabBar";
import {
  getNavItems,
  isNavItemActive,
  type NavKey,
} from "@/components/navItems";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

interface NavigationProps {
  showAuth?: boolean;
  isLandingPage?: boolean;
  isDashboard?: boolean;
  /** Override which primary tab is highlighted (see isNavItemActive). */
  activeNav?: NavKey | null;
}

const WHATSAPP_URL = "https://chat.whatsapp.com/KGWk0EFVJIH6CIr24oflLs?mode=gi_t";
const INSTAGRAM_URL = "https://www.instagram.com/booktrackr.app/";
const CONTACT_EMAIL = "hello@booktrackr.app";

const NAV_ICONS: Record<string, LucideIcon> = {
  home: Home,
  discover: Compass,
  communities: Users,
  profile: User,
};

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

/** Contact & feedback links, shared by the desktop dropdown and mobile menu. */
function FeedbackItems() {
  return (
    <>
      <DropdownMenuItem asChild>
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex cursor-pointer items-center gap-2.5 py-2.5"
        >
          <WhatsAppIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-sm">Join BookTrackr Community</span>
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="flex cursor-pointer items-center gap-2.5 py-2.5"
        >
          <Mail className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 break-all text-sm">
            {CONTACT_EMAIL}
          </span>
        </a>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex cursor-pointer items-center gap-2.5 py-2.5"
        >
          <InstagramIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-sm">
            Follow on Instagram: @booktrackr.app
          </span>
        </a>
      </DropdownMenuItem>
    </>
  );
}

function Avatar({
  imageUrl,
  name,
  className,
}: {
  imageUrl?: string | null;
  name: string;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={cn("rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-foreground",
        className
      )}
      aria-hidden="true"
    >
      {name.charAt(0)}
    </span>
  );
}

export default function Navigation({
  showAuth = true,
  isLandingPage = false,
  activeNav,
}: NavigationProps) {
  const { user, isLoaded, isSignedIn } = useUser();
  const { setTheme, theme, resolvedTheme } = useTheme();
  const pathname = usePathname() ?? "/";
  const [mounted, setMounted] = useState(false);

  const { data: convexUser } = useQuery({
    ...convexQuery(api.users.getCurrentUser, {}),
    enabled: !!user?.id,
  });

  const profileHref = user?.id
    ? `/user/${convexUser?.slug ?? user.id}`
    : "#";

  useEffect(() => {
    const frameId = requestAnimationFrame(() => setMounted(true));

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  const displayTheme = mounted ? resolvedTheme || theme : "light";
  // "system" follows the device's light/dark setting (the default).
  const themeChoice = mounted ? theme ?? "system" : "system";
  const themeOptions = [
    { value: "light", label: "Light", Icon: Sun },
    { value: "dark", label: "Dark", Icon: Moon },
    { value: "system", label: "Match device", Icon: Monitor },
  ] as const;
  const showAppNav = showAuth && !!isSignedIn;
  const navItems = getNavItems(profileHref);
  const displayName =
    user?.fullName ||
    user?.firstName ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Reader";

  const themeToggle = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!mounted}
          aria-label="Theme"
          className="h-9 w-9 rounded-full"
        >
          {displayTheme === "dark" ? (
            <Moon className="h-[18px] w-[18px]" />
          ) : (
            <Sun className="h-[18px] w-[18px]" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        {themeOptions.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className="flex cursor-pointer items-center gap-2.5"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {themeChoice === value && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      <header
        className={cn(
          "z-40 border-b border-border bg-background/85 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70",
          !isLandingPage && "sticky top-0"
        )}
      >
        <div
          className={cn(
            "mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 sm:h-16",
            isLandingPage ? "px-6" : "px-3 sm:px-6"
          )}
        >
          <Link
            href={showAppNav ? "/dashboard" : "/"}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap text-lg font-bold tracking-tight text-foreground transition-opacity hover:opacity-80 sm:text-xl"
          >
            <Image
              src="/icon.svg"
              alt=""
              width={32}
              height={32}
              priority
              className="h-8 w-8 rounded-lg dark:ring-1 dark:ring-white/15"
            />
            BookTrackr
          </Link>

          {/* Primary nav – tablet & desktop. Mobile uses the bottom tab bar. */}
          {showAppNav && (
            <nav
              aria-label="Primary"
              className="hidden flex-1 items-center justify-center md:flex"
            >
              <ul className="flex items-center gap-1 rounded-full border border-border bg-muted/50 p-1">
                {navItems.map((item) => {
                  const Icon = NAV_ICONS[item.key];
                  const active = isNavItemActive(
                    item,
                    pathname,
                    profileHref,
                    activeNav
                  );
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                          active
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className="hidden h-4 w-4 lg:block" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )}

          {/* Right side – tablet & desktop */}
          <div className="hidden shrink-0 items-center gap-1.5 md:flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-2 rounded-full px-2.5 lg:px-3"
                  aria-label="Feedback and contact"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span className="hidden lg:inline">Feedback</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
              >
                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Contact & Feedback
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <FeedbackItems />
              </DropdownMenuContent>
            </DropdownMenu>

            {themeToggle}

            {showAuth && !isLoaded && (
              <Skeleton className="h-9 w-9 rounded-full" />
            )}

            {showAuth && isLoaded && !isSignedIn && (
              <SignInButton mode="modal">
                <Button
                  size="sm"
                  className="ml-1 rounded-full px-4"
                >
                  Sign In
                </Button>
              </SignInButton>
            )}

            {showAppNav && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Account menu"
                    className="ml-1 rounded-full ring-offset-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Avatar
                      imageUrl={user?.imageUrl}
                      name={displayName}
                      className="h-9 w-9 border border-border"
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-60"
                >
                  <div className="flex items-center gap-3 px-2 py-2">
                    <Avatar
                      imageUrl={user?.imageUrl}
                      name={displayName}
                      className="h-9 w-9"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {displayName}
                      </p>
                      {user?.primaryEmailAddress?.emailAddress && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.primaryEmailAddress.emailAddress}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  {profileHref !== "#" && (
                    <DropdownMenuItem asChild>
                      <Link
                        href={profileHref}
                        className="flex cursor-pointer items-center gap-2.5 py-2"
                      >
                        <User className="h-4 w-4 shrink-0" />
                        My profile
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem asChild>
                    <Link
                      href="/dashboard/settings"
                      className="flex cursor-pointer items-center gap-2.5 py-2"
                    >
                      <SettingsIcon className="h-4 w-4 shrink-0" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <SignOutButton>
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2.5 py-2"
                      onClick={() =>
                        trackEvent("logout", { location: "header" })
                      }
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      Sign Out
                    </DropdownMenuItem>
                  </SignOutButton>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Right side – mobile */}
          <div className="flex items-center gap-1 md:hidden">
            {showAppNav && (
              <Button
                variant="ghost"
                size="icon"
                asChild
                aria-label="Reminder settings"
                className="h-9 w-9 rounded-full"
              >
                <Link href="/dashboard/settings">
                  <Bell className="h-[18px] w-[18px]" />
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Menu"
                  className="h-9 w-9 rounded-full"
                >
                  {showAppNav ? (
                    <Avatar
                      imageUrl={user?.imageUrl}
                      name={displayName}
                      className="h-8 w-8 border border-border"
                    />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-[calc(100vw-2rem)] min-w-[220px] max-w-64"
              >
                {showAppNav ? (
                  <div className="flex items-center gap-3 px-2 py-2">
                    <Avatar
                      imageUrl={user?.imageUrl}
                      name={displayName}
                      className="h-9 w-9"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {displayName}
                      </p>
                      {user?.primaryEmailAddress?.emailAddress && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.primaryEmailAddress.emailAddress}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <DropdownMenuLabel>Menu</DropdownMenuLabel>
                )}
                <DropdownMenuSeparator />

                {showAppNav && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link
                        href="/dashboard/settings"
                        className="flex cursor-pointer items-center gap-2.5 py-2.5"
                      >
                        <SettingsIcon className="h-4 w-4 shrink-0" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}

                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Contact & Feedback
                </DropdownMenuLabel>
                <FeedbackItems />

                <DropdownMenuSeparator />

                <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
                  Theme
                </DropdownMenuLabel>
                {mounted &&
                  themeOptions.map(({ value, label, Icon }) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={(event) => {
                        // Keep the menu open so the change is visible.
                        event.preventDefault();
                        setTheme(value);
                      }}
                      className="flex cursor-pointer items-center gap-2.5 py-2.5"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{label}</span>
                      {themeChoice === value && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}

                {showAuth && isLoaded && (
                  <>
                    <DropdownMenuSeparator />
                    {isSignedIn ? (
                      <SignOutButton>
                        <DropdownMenuItem
                          className="flex cursor-pointer items-center gap-2.5 py-2.5"
                          onClick={() =>
                            trackEvent("logout", { location: "nav_menu" })
                          }
                        >
                          <LogOut className="h-4 w-4 shrink-0" />
                          Sign Out
                        </DropdownMenuItem>
                      </SignOutButton>
                    ) : (
                      <SignInButton mode="modal">
                        <DropdownMenuItem
                          className="flex cursor-pointer items-center gap-2.5 py-2.5"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <LogIn className="h-4 w-4 shrink-0" />
                          Sign In
                        </DropdownMenuItem>
                      </SignInButton>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {showAppNav && !isLandingPage && (
        <MobileTabBar profileHref={profileHref} activeNav={activeNav} />
      )}
    </>
  );
}
