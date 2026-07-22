"use client";

import { useState } from "react";
import { Radio, RefreshCw } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LIVE_ROOM_EMBED_URL } from "@/lib/analytics";

export default function LiveRoomPageClient() {
  // Bumping the key forces the iframe to remount, reloading the Live Room.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-5xl p-3 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-3xl">
              <Radio className="h-6 w-6 text-primary" />
              Live Room
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Watch readers arrive on Book-Trackr in real time. Only
              country-level locations and recent page visits are shown.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setReloadKey((key) => key + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card className="overflow-hidden p-0">
          <iframe
            key={reloadKey}
            src={LIVE_ROOM_EMBED_URL}
            title="Live Room"
            loading="lazy"
            className="h-[70vh] min-h-[480px] w-full border-0"
          />
        </Card>
      </main>
      <Footer />
    </>
  );
}
