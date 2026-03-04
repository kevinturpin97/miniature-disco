/**
 * Push notification API calls.
 */

import client from "./client";

export async function getVapidPublicKey(): Promise<string> {
  const { data } = await client.get<{ public_key: string }>("/push/vapid-key/");
  return data.public_key;
}

export async function subscribePush(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await client.post("/push/subscribe/", {
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await client.delete("/push/subscribe/", { data: { endpoint } });
}
