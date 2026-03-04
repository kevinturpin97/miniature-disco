/**
 * Organization, Membership, and Invitation API calls.
 */

import client from "./client";
import type {
  Invitation,
  Membership,
  MemberRole,
  Organization,
  PaginatedResponse,
} from "@/types";

export async function listOrganizations(): Promise<Organization[]> {
  const { data } = await client.get<PaginatedResponse<Organization>>("/orgs/", {
    _silentError: true,
  });
  return data.results;
}

export async function getOrganization(slug: string): Promise<Organization> {
  const { data } = await client.get<Organization>(`/orgs/${slug}/`);
  return data;
}

export async function createOrganization(name: string): Promise<Organization> {
  const { data } = await client.post<Organization>("/orgs/", { name });
  return data;
}

export async function updateOrganization(
  slug: string,
  payload: { name: string },
): Promise<Organization> {
  const { data } = await client.patch<Organization>(`/orgs/${slug}/`, payload);
  return data;
}

export async function listMembers(slug: string): Promise<Membership[]> {
  const { data } = await client.get<PaginatedResponse<Membership> | Membership[]>(
    `/orgs/${slug}/members/`,
  );
  return Array.isArray(data) ? data : data.results;
}

export async function updateMemberRole(
  slug: string,
  membershipId: number,
  role: MemberRole,
): Promise<Membership> {
  const { data } = await client.patch<Membership>(
    `/orgs/${slug}/members/${membershipId}/`,
    { role },
  );
  return data;
}

export async function removeMember(
  slug: string,
  membershipId: number,
): Promise<void> {
  await client.delete(`/orgs/${slug}/members/${membershipId}/`);
}

export async function sendInvitation(
  slug: string,
  email: string,
  role: MemberRole = "VIEWER",
): Promise<Invitation> {
  const { data } = await client.post<Invitation>(`/orgs/${slug}/invite/`, {
    email,
    role,
  });
  return data;
}

export async function listInvitations(slug: string): Promise<Invitation[]> {
  const { data } = await client.get<Invitation[]>(`/orgs/${slug}/invite/`);
  return data;
}

export async function acceptInvitation(
  token: string,
): Promise<{ detail: string }> {
  const { data } = await client.post<{ detail: string }>(
    `/invitations/${token}/accept/`,
  );
  return data;
}
