"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useAction, useMutation as useConvexMutation } from "convex/react";
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
import { FormPageSkeleton } from "@/components/CommunityCardSkeleton";

const DEFAULT_REMINDER_TIME = "20:00";
const DEFAULT_TIMEZONE = "Africa/Lagos";
type PushPermissionState = NotificationPermission | "unsupported";

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

function isIosSafariLikeDevice() {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isInStandaloneMode() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function canUsePushNotifications() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function getPushUnsupportedMessage() {
  if (typeof window === "undefined") {
    return "Push notifications are only available in the browser.";
  }
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    return "Push notifications require HTTPS.";
  }
  if (isIosSafariLikeDevice() && !isInStandaloneMode()) {
    return "On iPhone and iPad, Safari only allows push after you install Book-Trackr to the Home Screen.";
  }
  return "This browser does not support web push notifications.";
}

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [reminder1Time, setReminder1Time] = useState(DEFAULT_REMINDER_TIME);
  const [reminder2Enabled, setReminder2Enabled] = useState(false);
  const [reminder2Time, setReminder2Time] = useState("09:00");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [pushPermission, setPushPermission] =
    useState<PushPermissionState>("unsupported");
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: settings, isPending: settingsPending } = useQuery({
    ...convexQuery(api.reminders.getReminderSettings, {}),
    enabled: isLoaded && isSignedIn,
  });

  const updateReminderSettingsMutation = useConvexMutation(
    api.reminders.updateReminderSettings
  );
  const savePushSubscriptionMutation = useConvexMutation(
    api.reminders.savePushSubscription
  );
  const sendTestPushAction = useAction(api.reminders.sendTestPush);

  const savedReminderSettings = useMemo(
    () =>
      settings
        ? {
            enabled: settings.remindersEnabled ?? false,
            reminder1Time: settings.reminder1Time ?? DEFAULT_REMINDER_TIME,
            reminder2Enabled: !!settings.reminder2Time,
            reminder2Time: settings.reminder2Time ?? "09:00",
            timezone:
              settings.timezone && TIMEZONE_OPTIONS.includes(settings.timezone)
                ? settings.timezone
                : DEFAULT_TIMEZONE,
          }
        : null,
    [settings]
  );

  const currentReminderSettings = useMemo(
    () => ({
      enabled,
      reminder1Time,
      reminder2Enabled,
      reminder2Time,
      timezone,
    }),
    [enabled, reminder1Time, reminder2Enabled, reminder2Time, timezone]
  );

  const hasUnsavedReminderChanges =
    savedReminderSettings !== null &&
    JSON.stringify(savedReminderSettings) !== JSON.stringify(currentReminderSettings);

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
      setPushSubscribed(settings.pushSubscriptionExists);
    } else if (isLoaded && user?.id && !settingsPending) {
      setTimezone(DEFAULT_TIMEZONE);
    }
  }, [settings, isLoaded, user?.id, settingsPending]);

  useEffect(() => {
    async function syncPushState() {
      const supported = canUsePushNotifications();
      setPushSupported(supported);
      if (!supported) {
        setPushPermission("unsupported");
        return;
      }

      setPushPermission(Notification.permission);
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          setPushSubscribed(true);
        }
      } catch (error) {
        console.warn("Unable to inspect push subscription state:", error);
      }
    }

    void syncPushState();
  }, []);

  async function ensureServiceWorkerRegistration() {
    if (!("serviceWorker" in navigator)) {
      throw new Error(getPushUnsupportedMessage());
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost") {
      throw new Error(getPushUnsupportedMessage());
    }

    const existingRegistration = await navigator.serviceWorker.getRegistration();
    if (existingRegistration) {
      return existingRegistration;
    }

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return registration;
    } catch (error) {
      throw new Error(
        process.env.NODE_ENV === "production"
          ? "The push service worker could not be registered. Reload the page and try again."
          : "Push notifications only work in a production build or deployed app. Use `npm run build && npm start` locally."
      );
    }
  }

  async function ensureNotificationPermission() {
    if (!("Notification" in window)) {
      throw new Error(getPushUnsupportedMessage());
    }

    if (Notification.permission === "denied") {
      setPushPermission("denied");
      throw new Error(
        "Push notifications are blocked for this site. Re-enable them in your browser settings and try again."
      );
    }

    if (Notification.permission === "granted") {
      setPushPermission("granted");
      return "granted";
    }

    const permission = await Notification.requestPermission();
    setPushPermission(permission);
    if (permission !== "granted") {
      throw new Error(
        permission === "denied"
          ? "Push notifications were blocked. Re-enable them in your browser settings and try again."
          : "Push permission was dismissed, so the app cannot subscribe this device yet."
      );
    }

    return permission;
  }

  async function ensurePushSubscription(): Promise<PushSubscription> {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_VAPID_PUBLIC_KEY is missing from the app environment, so this browser cannot create a push subscription."
      );
    }
    if (!canUsePushNotifications()) {
      throw new Error(getPushUnsupportedMessage());
    }

    await ensureNotificationPermission();
    const registration = await ensureServiceWorkerRegistration();
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      return existingSubscription;
    }

    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
  }

  async function persistPushSubscription(subscription: PushSubscription) {
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error("The browser returned an incomplete push subscription.");
    }

    await savePushSubscriptionMutation({
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    });
    setPushSubscribed(true);
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
    setTestSuccess(null);
    try {
      await updateReminderSettingsMutation({
        remindersEnabled: enabled,
        reminder1Time: reminder1Time || DEFAULT_REMINDER_TIME,
        reminder2Time: reminder2Enabled ? reminder2Time : null,
        timezone: timezone.trim() || DEFAULT_TIMEZONE,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.reminders.getReminderSettings, {}).queryKey,
      });

      if (enabled) {
        const subscription = await ensurePushSubscription();
        await persistPushSubscription(subscription);
      }

      setSavePending(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setSavePending(false);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save settings"
      );
      console.error(err);
    }
  }

  async function handleSendTestPush() {
    if (!isSignedIn) return;

    setTestPending(true);
    setSaveError(null);
    setSaveSuccess(false);
    setTestSuccess(null);

    try {
      const subscription = await ensurePushSubscription();
      await persistPushSubscription(subscription);
      await sendTestPushAction({});
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.reminders.getReminderSettings, {}).queryKey,
      });
      setTestSuccess(
        "Test notification sent. If it doesn’t appear, close the tab or app, then check browser and OS notification settings."
      );
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to send a test notification"
      );
      console.error(err);
    } finally {
      setTestPending(false);
    }
  }

  if (!isLoaded) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-3 sm:p-6">
          <FormPageSkeleton fields={4} />
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
              times and get a push notification when it is time to read.
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
                  <div className="mt-1 space-y-2">
                  
                    <div className="mt-3 space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Push status:{" "}
                        {pushSupported
                          ? pushSubscribed
                            ? pushPermission === "granted"
                              ? "connected on this device"
                              : "subscription exists, but browser permission is not granted right now"
                            : "not connected yet"
                          : "not supported on this browser/device"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {pushSupported
                          ? "Best path: Install the app to the Home Screen first and save settings."
                          : getPushUnsupportedMessage()}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={savePending}
                >
                  {savePending
                    ? "Saving…"
                    : hasUnsavedReminderChanges
                      ? "Save settings to apply changes"
                      : "Save settings"}
                </Button>
                {hasUnsavedReminderChanges && (
                  <p
                    className="text-sm text-amber-600 dark:text-amber-400"
                    role="status"
                  >
                    You changed your reminder settings. Click{" "}
                    <span className="font-medium">Save settings</span> again to
                    apply the new reminder time or timezone.
                  </p>
                )}
                {enabled && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={testPending}
                    onClick={handleSendTestPush}
                  >
                    {testPending ? "Sending test…" : "Send test notification"}
                  </Button>
                )}
                {saveSuccess && !hasUnsavedReminderChanges && (
                  <p
                    className="text-sm text-green-600 dark:text-green-400"
                    role="status"
                  >
                    Settings saved.
                  </p>
                )}
                {testSuccess && (
                  <p
                    className="text-sm text-green-600 dark:text-green-400"
                    role="status"
                  >
                    {testSuccess}
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
