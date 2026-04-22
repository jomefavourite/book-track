"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Navigation from "@/components/Navigation";
import PublicBookCard from "@/components/PublicBookCard";
import PWAInstallBanner from "@/components/PWAInstallBanner";

const featureCards = [
  {
    icon: "🗓️",
    title: "Flexible Reading Plans",
    description:
      "Switch between calendar mode and fixed-days mode so each book fits your schedule, not the other way around.",
  },
  {
    icon: "📚",
    title: "Pages or Chapters",
    description:
      "Track progress by pages or chapters, including chapter-only books with smarter daily targets and progress summaries.",
  },
  {
    icon: "⏱️",
    title: "Reading Timer",
    description:
      "Run a focused reading timer for the day, save the session length, and keep momentum without leaving your plan.",
  },
  {
    icon: "🔔",
    title: "Daily Reminders",
    description:
      "Set one or two reminder times and get notified by push when it is time to read.",
  },
  {
    icon: "📈",
    title: "Catch-Up Insights",
    description:
      "See completion progress, missed days, and catch-up suggestions so you always know what to read next.",
  },
  {
    icon: "🌍",
    title: "Public Profiles and Sharing",
    description:
      "Share books publicly, build a reader profile, and let people follow your reading journey when you want them to.",
  },
  {
    icon: "🗂️",
    title: "Organize Your Library",
    description:
      "Keep active books in focus, archive finished ones, and manage multiple reading journeys from one dashboard.",
  },
  {
    icon: "📱",
    title: "Installable PWA",
    description:
      "Install Book-Trackr on your phone or desktop for quick access, offline backup behavior, and app-like reading sessions.",
  },
];

export default function LandingPage() {
  const { data: publicBooks, isPending } = useQuery({
    ...convexQuery(api.books.getPublicBooks, {}),
  });

  return (
    <div className="min-h-screen bg-background">
      <PWAInstallBanner />
      {/* Header */}
      <Navigation isLandingPage={true} />

      {/* Hero Section */}
      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="mb-4 text-5xl font-bold text-foreground">
          Track Your Reading Journey
        </h2>
        <p className="mb-8 text-xl text-muted-foreground max-w-2xl mx-auto">
          Plan books by pages or chapters, stay on track with reminders and a
          reading timer, and share your progress when you want to.
        </p>
        <div className="flex justify-center gap-4">
          <SignInButton mode="modal">
            <Button
              variant="default"
              size="lg"
            >
              Get Started
            </Button>
          </SignInButton>
          <Button
            variant="outline"
            size="lg"
            asChild
          >
            <Link href="#features">Learn More</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section
        id="features"
        className="mx-auto max-w-6xl px-6 py-16"
      >
        <h3 className="mb-12 text-center text-3xl font-bold text-foreground">
          Features
        </h3>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {featureCards.map((feature) => (
            <Card
              key={feature.title}
              className="p-6"
            >
              <div className="mb-4 text-4xl">{feature.icon}</div>
              <h4 className="mb-2 text-xl font-semibold text-card-foreground">
                {feature.title}
              </h4>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* PWA Installation Guide */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h3 className="mb-12 text-center text-3xl font-bold text-foreground">
          Install as PWA
        </h3>
        <Card className="p-8">
          <p className="mb-6 text-lg text-muted-foreground">
            Install Book-Trackr as a Progressive Web App for offline access and
            an app-like experience on your device.
          </p>
          <div className="space-y-6">
            <div>
              <h4 className="mb-2 font-semibold text-card-foreground">
                Chrome/Edge (Desktop)
              </h4>
              <p className="text-muted-foreground">
                Click the install icon in the address bar, or go to the menu →
                "Install Book-Trackr"
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-card-foreground">
                Chrome/Edge (Android)
              </h4>
              <p className="text-muted-foreground">
                Tap the menu (three dots) → "Add to Home Screen" or "Install
                App"
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-card-foreground">
                Safari (iOS)
              </h4>
              <p className="text-muted-foreground">
                Tap the Share button → "Add to Home Screen"
              </p>
            </div>
            <div>
              <h4 className="mb-2 font-semibold text-card-foreground">
                Safari (macOS)
              </h4>
              <p className="text-muted-foreground">
                File menu → "Add to Dock" or use the Share button
              </p>
            </div>
          </div>
          <div className="mt-6 rounded-md bg-muted p-4">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Benefits:</strong> Offline
              access, faster loading, app-like experience, and easy access from
              your home screen or dock.
            </p>
          </div>
        </Card>
      </section>

      {/* Public Books Gallery */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h3 className="mb-12 text-center text-3xl font-bold text-foreground">
          Public Reading Journeys
        </h3>
        {isPending ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <div className="text-lg text-muted-foreground">
              Loading public books...
            </div>
          </div>
        ) : publicBooks && publicBooks.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {publicBooks.slice(0, 6).map((book: any) => (
                <PublicBookCard
                  key={book._id}
                  book={book}
                  progress={book.progress || 0}
                />
              ))}
            </div>
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                size="lg"
                asChild
              >
                <Link href="/public">View All Reading Journeys</Link>
              </Button>
            </div>
          </>
        ) : (
          <Card className="p-12 text-center">
            <p className="text-lg text-muted-foreground">
              No public books yet. Be the first to share your reading journey!
            </p>
          </Card>
        )}
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <Card className="border-border bg-primary p-12 text-center">
          <h3 className="mb-4 text-3xl font-bold text-primary-foreground">
            Ready to Start Tracking?
          </h3>
          <p className="mb-8 text-xl text-primary-foreground/80">
            Join readers who are already tracking their progress
          </p>
          <SignInButton mode="modal">
            <Button
              variant="secondary"
              size="lg"
            >
              Get Started Free
            </Button>
          </SignInButton>
        </Card>
      </section>
    </div>
  );
}
