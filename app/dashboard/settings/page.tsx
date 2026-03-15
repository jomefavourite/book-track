"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation as useConvexMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const DEFAULT_REMINDER_TIME = "20:00";
const DEFAULT_TIMEZONE = "Africa/Lagos";

type ReminderChannel = "push" | "email" | "both";

function getTimezoneOptions(): string[] {
  if (typeof Intl === "undefined" || !("supportedValuesOf" in Intl)) {
    return [DEFAULT_TIMEZONE, "UTC"];
  }
  try {
    const zones = (
      Intl as { supportedValuesOf(key: string): string[] }
    ).supportedValuesOf("timeZone");
    const sorted = [...zones].sort((a, b) => a.localeCompare(b));
    if (sorted.includes(DEFAULT_TIMEZONE)) return sorted;
    return [DEFAULT_TIMEZONE, ...sorted];
  } catch {
    return [DEFAULT_TIMEZONE, "UTC"];
  }
}

const TIMEZONE_OPTIONS = getTimezoneOptions();

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [reminder1Time, setReminder1Time] = useState(DEFAULT_REMINDER_TIME);
  const [reminder2Enabled, setReminder2Enabled] = useState(false);
  const [reminder2Time, setReminder2Time] = useState("09:00");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [channel, setChannel] = useState<ReminderChannel>("push");
  const [pushPermissionRequested, setPushPermissionRequested] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: settings, isPending: settingsPending } = useQuery({
    ...convexQuery(api.reminders.getReminderSettings, {
      userId: user?.id ?? "",
    }),
    enabled: isLoaded && !!user?.id,
  });

  const updateReminderSettingsMutation = useConvexMutation(
    api.reminders.updateReminderSettings
  );
  const savePushSubscriptionMutation = useConvexMutation(
    api.reminders.savePushSubscription
  );

  useEffect(() => {
    if (settings) {
      setEnabled(settings.remindersEnabled ?? false);
      setReminder1Time(settings.reminder1Time ?? DEFAULT_REMINDER_TIME);
      setReminder2Enabled(!!settings.reminder2Time);
      setReminder2Time(settings.reminder2Time ?? "09:00");
      setTimezone(
        settings.timezone && TIMEZONE_OPTIONS.includes(settings.timezone)
          ? settings.timezone
          : DEFAULT_TIMEZONE
      );
      setChannel(settings.reminderChannel ?? "push");
    } else if (isLoaded && user?.id && !settingsPending) {
      setTimezone(DEFAULT_TIMEZONE);
    }
  }, [settings, isLoaded, user?.id, settingsPending]);

  async function subscribePush(): Promise<PushSubscription | null> {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return null;
    if (!("serviceWorker" in navigator) || !("PushManager" in window))
      return null;
    const SW_READY_MS = 8000;
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Service worker not ready")),
          SW_READY_MS
        )
      ),
    ]);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    return sub;
  }

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id || !isSignedIn) return;
    setSavePending(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await updateReminderSettingsMutation({
        userId: user.id,
        remindersEnabled: enabled,
        reminder1Time: reminder1Time || DEFAULT_REMINDER_TIME,
        reminder2Time: reminder2Enabled ? reminder2Time : null,
        timezone: timezone.trim() || DEFAULT_TIMEZONE,
        reminderChannel: channel,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.reminders.getReminderSettings, {
          userId: user.id,
        }).queryKey,
      });
      setSavePending(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);

      // Request push subscription only when Push/Both and not yet saved (so we can retry if it failed before)
      if (
        (channel === "push" || channel === "both") &&
        enabled &&
        !pushPermissionRequested
      ) {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          const sub = await subscribePush();
          if (sub) {
            const json = sub.toJSON();
            await savePushSubscriptionMutation({
              userId: user.id,
              endpoint: json.endpoint!,
              p256dh: json.keys!.p256dh,
              auth: json.keys!.auth,
            });
            setPushPermissionRequested(true);
          } else {
            // setSaveError(
            //   "Push subscription failed. Set NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local (same as Convex VAPID_PUBLIC_KEY) and run a production build (npm run build && npm start)."
            // );
          }
        }
      }
    } catch (err) {
      setSavePending(false);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings"
      );
      console.error(err);
    }
  }

  if (!isLoaded) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  if (!user?.id) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <p className="text-muted-foreground">
            Sign in to manage reminder settings.
          </p>
          <Button
            asChild
            className="mt-4"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl p-3 sm:p-6">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Dashboard
          </Link>
        </div>
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Reminder settings</CardTitle>
            <CardDescription>
              Get notified to read your book for the day. Choose one or two
              times and how you’d like to be reminded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSave}
              className="space-y-6"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="reminders-enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <label
                  htmlFor="reminders-enabled"
                  className="text-sm font-medium"
                >
                  Enable daily reminders
                </label>
              </div>

              {enabled && (
                <>
                  <div>
                    <label
                      htmlFor="reminder1"
                      className="mb-1 block text-sm font-medium"
                    >
                      First reminder time
                    </label>
                    <Input
                      id="reminder1"
                      type="time"
                      value={reminder1Time}
                      onChange={(e) => setReminder1Time(e.target.value)}
                      className="max-w-[140px]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="reminder2-enabled"
                      checked={reminder2Enabled}
                      onChange={(e) => setReminder2Enabled(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <label
                      htmlFor="reminder2-enabled"
                      className="text-sm font-medium"
                    >
                      Second reminder
                    </label>
                  </div>
                  {reminder2Enabled && (
                    <div>
                      <label
                        htmlFor="reminder2"
                        className="mb-1 block text-sm font-medium"
                      >
                        Second reminder time
                      </label>
                      <Input
                        id="reminder2"
                        type="time"
                        value={reminder2Time}
                        onChange={(e) => setReminder2Time(e.target.value)}
                        className="max-w-[140px]"
                      />
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="timezone"
                      className="mb-1 block text-sm font-medium"
                    >
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="flex h-9 w-full max-w-[280px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <option
                          key={tz}
                          value={tz}
                        >
                          {tz.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="mb-2 block text-sm font-medium">
                      Notify me via
                    </span>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="channel"
                          value="push"
                          checked={channel === "push"}
                          onChange={() => setChannel("push")}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Push</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="channel"
                          value="email"
                          checked={channel === "email"}
                          onChange={() => setChannel("email")}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Email</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="channel"
                          value="both"
                          checked={channel === "both"}
                          onChange={() => setChannel("both")}
                          className="h-4 w-4"
                        />
                        <span className="text-sm">Both</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={savePending}
                >
                  {savePending ? "Saving…" : "Save settings"}
                </Button>
                {saveSuccess && (
                  <p
                    className="text-sm text-green-600 dark:text-green-400"
                    role="status"
                  >
                    Settings saved.
                  </p>
                )}
                {saveError && (
                  <p
                    className="text-sm text-destructive"
                    role="alert"
                  >
                    {saveError}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
