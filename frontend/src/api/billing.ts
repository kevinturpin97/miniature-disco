/**
 * API client for billing endpoints (Sprint 22).
 */

import client from "./client";
import type { BillingOverview } from "@/types";

export const getBillingOverview = (orgSlug: string) =>
  client.get<BillingOverview>(`/orgs/${orgSlug}/billing/`);

export const createCheckoutSession = (orgSlug: string, plan: string) =>
  client.post<{ checkout_url: string }>(`/orgs/${orgSlug}/billing/checkout/`, { plan });

export const createCustomerPortal = (orgSlug: string) =>
  client.post<{ portal_url: string }>(`/orgs/${orgSlug}/billing/portal/`);
