"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import Navigation from "@/components/Navigation";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import Footer from "@/components/Footer";
import {
  Reveal,
  Marquee,
  AvatarStack,
  PublicBooksGrid,
} from "@/components/landing/shared";
import {
  Bell,
  TrendingUp,
  Smartphone,
  PartyPopper,
  ArrowRight,
} from "lucide-react";

const MARQUEE_ITEMS = [
  "Atomic Habits · 57%",
  "Things Fall Apart · finished 🎉",
  "Deep Work · day 18 of 20",
  "Purple Hibiscus · 12-day streak",
  "The Alchemist · 3 friends reading",
  "Sapiens · back on track",
  "The Psychology of Money · 81%",
  "Half of a Yellow Sun · new reflection",
];

const STREAK_DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const STREAK_DONE = [true, true, true, true, true, false, false];

const CIRCLE_MEMBERS = [
  { name: "Ada", pct: 82 },
  { name: "Tomi", pct: 74 },
  { name: "You", pct: 68 },
  { name: "Kemi", pct: 61 },
];

export default function LandingV3() {
  return (
    <div className="min-h-screen bg-background">
      <PWAInstallBanner />
      <Navigation isLandingPage={true} />

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-16 pt-16 lg:grid-cols-[1.1fr_1fr] lg:pt-24">
        <div>
          <p
            className="landing-hero-enter mb-6 inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-foreground"
            style={{ animationDelay: "0ms" }}
          >
            <span className="landing-blink inline-block h-1.5 w-1.5 rounded-full bg-foreground" />
            Reading is better with friends
          </p>
          <h1 className="text-5xl font-bold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-[4.25rem]">
            <span
              className="landing-hero-enter block"
              style={{ animationDelay: "100ms" }}
            >
              Finish more books,
            </span>
            <span
              className="landing-hero-enter block text-muted-foreground"
              style={{ animationDelay: "250ms" }}
            >
              together.
            </span>
          </h1>
          <p
            className="landing-hero-enter mt-6 max-w-lg text-lg text-muted-foreground sm:text-xl"
            style={{ animationDelay: "400ms" }}
          >
            Turn any book into a daily plan, keep your streak alive with timers
            and reminders, and share every milestone with the people reading
            alongside you.
          </p>
          <div
            className="landing-hero-enter mt-8 flex flex-wrap items-center gap-4"
            style={{ animationDelay: "550ms" }}
          >
            <SignInButton mode="modal">
              <Button size="lg" className="group px-8 text-base">
                Start reading free
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Button>
            </SignInButton>
            <Button variant="ghost" size="lg" className="text-base" asChild>
              <Link href="#everything">Explore the app</Link>
            </Button>
          </div>
          <p
            className="landing-hero-enter mt-6 text-sm text-muted-foreground"
            style={{ animationDelay: "700ms" }}
          >
            Free to start · No credit card · Installs like an app
          </p>
        </div>

        {/* Live app mockup */}
        <div className="relative mx-auto w-full max-w-sm">
          <div
            className="landing-hero-enter"
            style={{ animationDelay: "350ms" }}
          >
            <div className="landing-float rounded-2xl border border-border bg-card p-6 shadow-lg shadow-foreground/5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-semibold text-card-foreground">
                    Atomic Habits
                  </p>
                  <p className="text-sm text-muted-foreground">James Clear</p>
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                  On track
                </span>
              </div>

              <div className="mt-5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Day 12 of 21</span>
                  <span className="font-semibold tabular-nums text-card-foreground">
                    57%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="landing-bar-fill h-full rounded-full bg-foreground"
                    style={{ width: "57%", animationDelay: "800ms" }}
                  />
                </div>
              </div>

              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  This week
                </p>
                <div className="mt-2 flex gap-2">
                  {STREAK_DAYS.map((d, i) => (
                    <span
                      key={i}
                      className={`landing-dot-on flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                        STREAK_DONE[i]
                          ? "bg-foreground text-background"
                          : "border border-dashed border-border text-muted-foreground"
                      }`}
                      style={{ animationDelay: `${900 + i * 140}ms` }}
                    >
                      {STREAK_DONE[i] ? "✓" : d}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 rounded-xl bg-muted/70 px-4 py-3">
                <AvatarStack people={["AD", "TM", "KO"]} size="sm" />
                <p className="text-sm text-muted-foreground">
                  3 friends reading this
                </p>
              </div>
            </div>

            <div className="landing-toast-loop mx-auto -mt-4 flex w-[88%] items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 shadow-md">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                <PartyPopper className="h-4 w-4" />
              </span>
              <p className="text-sm text-foreground">
                <span className="font-semibold">Ada</span>
                {" just finished Chapter 7 — you're next!"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Activity marquee */}
      <div className="border-y border-border bg-muted/40 py-4">
        <Marquee duration={55}>
          {MARQUEE_ITEMS.map((item) => (
            <span
              key={item}
              className="mx-5 flex items-center gap-5 whitespace-nowrap text-sm font-medium text-muted-foreground"
            >
              {item}
              <span className="h-1 w-1 rounded-full bg-border" />
            </span>
          ))}
        </Marquee>
      </div>

      {/* Bento — everything the app does */}
      <section id="everything" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for momentum
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
            Plan realistically, read consistently, and never do it alone.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Plans tile */}
          <Reveal className="sm:col-span-2">
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                Plans that fit your life
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Pages or chapters, calendar or fixed days — every book becomes
                realistic daily targets.
              </p>
              <div className="mt-6 grid grid-cols-7 gap-2">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span
                    key={i}
                    className={`flex h-8 items-center justify-center rounded-md text-[10px] font-medium tabular-nums ${
                      i < 9
                        ? "bg-foreground text-background"
                        : i === 9
                          ? "border-2 border-foreground text-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i < 9 ? "✓" : `d${i + 1}`}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                9 days done · today: pages 112–124
              </p>
            </div>
          </Reveal>

          {/* Timer tile */}
          <Reveal delay={100}>
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                Reading timer
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Focused sessions, saved to your day.
              </p>
              <div className="mt-6 flex justify-center">
                <div className="relative h-24 w-24">
                  <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      strokeWidth="3"
                      className="stroke-muted"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      strokeWidth="3"
                      strokeLinecap="round"
                      pathLength={100}
                      className="landing-ring stroke-foreground"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums text-card-foreground">
                    23:14
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Reminders tile */}
          <Reveal delay={200}>
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                Daily reminders
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                A gentle push when it&apos;s reading time.
              </p>
              <div className="mt-6 flex justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Bell className="landing-wiggle h-7 w-7 text-foreground" />
                </span>
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                &ldquo;Time to read — 12 pages to stay on track&rdquo;
              </p>
            </div>
          </Reveal>

          {/* Catch-up tile */}
          <Reveal>
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                Catch-up insights
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Missed a few days? See exactly how to recover.
              </p>
              <div className="mt-6 flex items-center gap-3">
                <TrendingUp className="h-5 w-5 shrink-0 text-foreground" />
                <p className="text-sm text-muted-foreground">
                  Read <span className="font-semibold text-card-foreground">16 pages/day</span>{" "}
                  to finish on time
                </p>
              </div>
            </div>
          </Reveal>

          {/* PWA tile */}
          <Reveal delay={100}>
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                Installs like an app
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Add to your home screen or dock — offline-friendly, always a tap
                away.
              </p>
              <div className="mt-6 flex justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                  <Smartphone className="h-7 w-7 text-foreground" />
                </span>
              </div>
            </div>
          </Reveal>

          {/* Public profile tile */}
          <Reveal delay={200} className="sm:col-span-2">
            <div className="group h-full rounded-2xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-md">
              <h3 className="text-lg font-semibold text-card-foreground">
                A reading profile worth sharing
              </h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Make books public, build your reader profile, and let friends
                follow the journey.
              </p>
              <div className="mt-6 flex items-center justify-between rounded-xl bg-muted/70 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                    FJ
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      @favourite
                    </p>
                    <p className="text-xs text-muted-foreground">
                      12 books · 5 finished this year
                    </p>
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  book-trackr.app/user/favourite
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Community showcase — the centerpiece */}
      <section className="bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="grid items-center gap-14 lg:grid-cols-[1.15fr_1fr]">
            <div>
              <Reveal>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-background/50">
                  Communities
                </p>
                <h2 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                  A book club that
                  <br />
                  <span className="text-background/50">actually finishes</span>
                  <br />
                  the book.
                </h2>
                <p className="mt-6 max-w-lg text-lg text-background/70">
                  Create a community around any book. Everyone reads on the same
                  schedule, sees each other&apos;s progress, and turns solo
                  reading into a running conversation.
                </p>
              </Reveal>
              <Reveal delay={150}>
                <ul className="mt-8 space-y-3 text-background/80">
                  {[
                    "Shared reading schedules with a weekly rhythm",
                    "Member progress, side by side",
                    "Reflections and highlights on every chapter",
                    "Invite links that bring friends in instantly",
                  ].map((line) => (
                    <li key={line} className="flex items-center gap-3">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-background" />
                      {line}
                    </li>
                  ))}
                </ul>
                <SignInButton mode="modal">
                  <Button variant="secondary" size="lg" className="mt-10 px-8">
                    Start a reading circle
                  </Button>
                </SignInButton>
              </Reveal>
            </div>

            <Reveal delay={200}>
              <div className="rounded-2xl border border-background/15 bg-background/5 p-6 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">Deep Work Book Club</p>
                    <p className="text-sm text-background/50">
                      Week 3 · Chapter 7 of 10
                    </p>
                  </div>
                  <AvatarStack people={["AD", "TM", "KO", "ZB"]} size="sm" />
                </div>
                <div className="mt-6 space-y-4">
                  {CIRCLE_MEMBERS.map((m, i) => (
                    <div key={m.name}>
                      <div className="flex justify-between text-sm">
                        <span
                          className={
                            m.name === "You"
                              ? "font-semibold"
                              : "text-background/60"
                          }
                        >
                          {m.name}
                        </span>
                        <span className="tabular-nums text-background/60">
                          {m.pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/15">
                        <div
                          className="landing-bar-fill h-full rounded-full bg-background"
                          style={{
                            width: `${m.pct}%`,
                            animationDelay: `${300 + i * 180}ms`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-xl bg-background/10 p-4">
                  <p className="text-sm italic text-background/80">
                    &ldquo;Chapter 7 changed how I plan my mornings — anyone
                    else trying the shutdown ritual?&rdquo;
                  </p>
                  <p className="mt-2 text-xs font-medium text-background/60">
                    — Ada · Reflection on Ch. 7
                  </p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Public journeys */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Live from the shelves
          </h2>
          <p className="mt-3 text-lg text-muted-foreground">
            Real readers, real progress — public journeys happening right now.
          </p>
        </Reveal>
        <Reveal delay={150} className="mt-10">
          <PublicBooksGrid />
        </Reveal>
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-6xl px-6 py-24 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Your next book deserves a finish date.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Set the plan, invite a friend, and start tonight — free.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
              <SignInButton mode="modal">
                <Button size="lg" className="group px-10 text-base">
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </SignInButton>
              <Button variant="outline" size="lg" className="text-base" asChild>
                <Link href="/public">Browse public journeys</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
