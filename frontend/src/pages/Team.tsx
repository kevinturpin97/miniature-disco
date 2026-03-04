/**
 * Team Management page — manage members, invite users, view roles.
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import * as orgApi from "@/api/organizations";
import type { Membership, Invitation, MemberRole } from "@/types";
import { Spinner } from "@/components/ui/Spinner";

const ROLE_OPTIONS: MemberRole[] = ["OWNER", "ADMIN", "OPERATOR", "VIEWER"];

export default function Team() {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation();
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const [members, setMembers] = useState<Membership[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("VIEWER");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [m, inv] = await Promise.all([
        orgApi.listMembers(currentOrg.slug),
        orgApi.listInvitations(currentOrg.slug),
      ]);
      setMembers(m);
      setInvitations(inv.filter((i) => !i.accepted && !i.is_expired));
    } catch {
      setError(tc("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [currentOrg, tc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManage =
    currentOrg?.my_role === "OWNER" || currentOrg?.my_role === "ADMIN";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(false);
    try {
      await orgApi.sendInvitation(currentOrg.slug, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("VIEWER");
      setInviteSuccess(true);
      await loadData();
      setTimeout(() => setInviteSuccess(false), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { email?: string[] } } })?.response?.data
          ?.email?.[0] ?? tc("errors.generic");
      setInviteError(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(membershipId: number, role: MemberRole) {
    if (!currentOrg) return;
    try {
      await orgApi.updateMemberRole(currentOrg.slug, membershipId, role);
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    }
  }

  async function handleRemove(membershipId: number) {
    if (!currentOrg) return;
    if (!window.confirm(t("team.confirmRemove"))) return;
    try {
      await orgApi.removeMember(currentOrg.slug, membershipId);
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    }
  }

  if (!currentOrg) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">{t("team.noOrg")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("team.title")}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("team.subtitle", { org: currentOrg.name })}
        </p>
        <div className="mt-2 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 font-medium">
            {currentOrg.plan}
          </span>
          <span>
            {t("team.memberCount", { count: currentOrg.member_count })}
          </span>
          <span>
            {t("team.greenhouseCount", { count: currentOrg.greenhouse_count })}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Invite form (ADMIN+ only) */}
      {canManage && (
        <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("team.inviteTitle")}
          </h2>
          <form onSubmit={handleInvite} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {tc("labels.email")}
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                placeholder="user@example.com"
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("team.role")}
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
              >
                {ROLE_OPTIONS.filter((r) => r !== "OWNER").map((role) => (
                  <option key={role} value={role}>
                    {t(`team.roles.${role}`)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {inviting ? tc("status.loading") : t("team.sendInvite")}
            </button>
          </form>
          {inviteError && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400">{inviteError}</p>
          )}
          {inviteSuccess && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              {t("team.inviteSent")}
            </p>
          )}
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("team.pendingInvitations")}
          </h2>
          <div className="mt-3 divide-y dark:divide-gray-700">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {inv.email}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t("team.invitedBy", { name: inv.invited_by_username })} &middot;{" "}
                    {t(`team.roles.${inv.role}`)}
                  </p>
                </div>
                <span className="rounded bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:text-yellow-300">
                  {t("team.pending")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t("team.members")}
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="mt-3 divide-y dark:divide-gray-700">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.username}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && member.role !== "OWNER" ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value as MemberRole)
                        }
                        className="rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs dark:bg-gray-700 dark:text-gray-100"
                      >
                        {ROLE_OPTIONS.filter((r) => r !== "OWNER").map((role) => (
                          <option key={role} value={role}>
                            {t(`team.roles.${role}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title={t("team.removeMember")}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <span className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {t(`team.roles.${member.role}`)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
