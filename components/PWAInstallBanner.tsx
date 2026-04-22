"use client";

import { useEffect, useState } from "react";
import { X, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallMode = "chrome" | "ios" | null;

const DISMISSED_KEY = "pwa-install-dismissed";

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isInStandaloneMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone === true)
  );
}

export default function PWAInstallBanner() {
  const [mode, setMode] = useState<InstallMode>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isInStandaloneMode()) return;
    if (sessionStorage.getItem(DISMISSED_KEY)) return;

    if (isIOS()) {
      setMode("ios");
      setVisible(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as typeof deferredPrompt);
      setMode("chrome");
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
  }

  if (!visible || !mode) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-xl border border-border bg-background shadow-lg">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-lg font-bold select-none">
          B
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Install Book-Trackr</p>
          {mode === "chrome" ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add to your home screen for quick access.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap{" "}
              <Share className="inline h-3.5 w-3.5 align-[-2px]" />{" "}
              then{" "}
              <strong className="text-foreground font-medium">Add to Home Screen</strong>{" "}
              <Plus className="inline h-3 w-3 align-[-1px]" />
            </p>
          )}
          {mode === "chrome" && (
            <Button size="sm" className="mt-2 h-7 text-xs" onClick={install}>
              Install
            </Button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
