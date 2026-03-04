/**
 * Hook to manage Web Push notification subscriptions.
 *
 * Handles requesting permission, subscribing/unsubscribing, and syncing
 * the subscription state with the backend.
 */

import { useCallback, useEffect, useState } from "react";

import { getVapidPublicKey, subscribePush, unsubscribePush } from "@/api/push";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "unsubscribed" | "loading";

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string>("");

  const checkState = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setState("denied");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? "subscribed" : "unsubscribed");
    } catch {
      setState("unsubscribed");
    }
  }, []);

  useEffect(() => {
    checkState();
  }, [checkState]);

  const subscribe = useCallback(async () => {
    setError("");
    try {
      const vapidKey = await getVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer,
      });

      await subscribePush(subscription);
      setState("subscribed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to subscribe";
      setError(msg);
      if (Notification.permission === "denied") {
        setState("denied");
      }
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("unsubscribed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unsubscribe";
      setError(msg);
    }
  }, []);

  return { state, error, subscribe, unsubscribe };
}
