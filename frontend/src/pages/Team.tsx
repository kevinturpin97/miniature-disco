/**
 * Team Management page — manage members, invite users, view roles.
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
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

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("VIEWER");
  const [inviting, setInviting] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    try {
      const [m, inv] = await Promise.all([
        orgApi.listMembers(currentOrg.slug),
        orgApi.listInvitations(currentOrg.slug),
      ]);
      setMembers(m);
      setInvitations(inv.filter((i) => !i.accepted && !i.is_expired));
    } catch {
      // handled by global interceptor
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManage =
    currentOrg?.my_role === "OWNER" || currentOrg?.my_role === "ADMIN";

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      await orgApi.sendInvitation(currentOrg.slug, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("VIEWER");
      toast.success(tc("success.invitationSent"));
      await loadData();
    } catch {
      // handled by global interceptor
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(membershipId: number, role: MemberRole) {
    if (!currentOrg) return;
    try {
      await orgApi.updateMemberRole(currentOrg.slug, membershipId, role);
      await loadData();
      toast.success(tc("success.roleUpdated"));
    } catch {
      // handled by global interceptor
    }
  }

  async function handleRemove(membershipId: number) {
    if (!currentOrg) return;
    if (!window.confirm(t("team.confirmRemove"))) return;
    try {
      await orgApi.removeMember(currentOrg.slug, membershipId);
      await loadData();
      toast.success(tc("success.memberRemoved"));
    } catch {
      // handled by global interceptor
    }
  }

  if (!currentOrg) {
    return (
      <div className="p-6">
        <p className="text-base-content/60">{t("team.noOrg")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-base-content">{t("team.title")}</h1>
        <p className="mt-1 text-sm text-base-content/60">
          {t("team.subtitle", { org: currentOrg.name })}
        </p>
        <div className="mt-2 flex items-center gap-3 text-sm text-base-content/60">
          <span className="rounded bg-base-200 px-2 py-0.5 font-medium">
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

      {/* Invite form (ADMIN+ only) */}
      {canManage && (
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h2 className="text-lg font-semibold text-base-content">
            {t("team.inviteTitle")}
          </h2>
          <form onSubmit={handleInvite} className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-base-content/80">
                {tc("labels.email")}
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-base-300 px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-1 focus:ring-primary bg-base-100 text-base-content"
                placeholder="user@example.com"
              />
            </div>
            <div className="w-40">
              <label className="block text-sm font-medium text-base-content/80">
                {t("team.role")}
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className="mt-1 block w-full rounded-lg border border-base-300 px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-1 focus:ring-primary bg-base-100 text-base-content"
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
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-content hover:bg-primary/80 disabled:opacity-50"
            >
              {inviting ? tc("status.loading") : t("team.sendInvite")}
            </button>
          </form>
        </div>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="rounded-lg border border-base-300 bg-base-100 p-4">
          <h2 className="text-lg font-semibold text-base-content">
            {t("team.pendingInvitations")}
          </h2>
          <div className="mt-3 divide-y divide-base-300">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-base-content">
                    {inv.email}
                  </p>
                  <p className="text-xs text-base-content/60">
                    {t("team.invitedBy", { name: inv.invited_by_username })} &middot;{" "}
                    {t(`team.roles.${inv.role}`)}
                  </p>
                </div>
                <span className="rounded bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {t("team.pending")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <div className="rounded-lg border border-base-300 bg-base-100 p-4">
        <h2 className="text-lg font-semibold text-base-content">
          {t("team.members")}
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner className="h-8 w-8" />
          </div>
        ) : (
          <div className="mt-3 divide-y divide-base-300">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-sm font-medium text-base-content">
                    {member.username}
                  </p>
                  <p className="text-xs text-base-content/60">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && member.role !== "OWNER" ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value as MemberRole)
                        }
                        className="rounded-lg border border-base-300 px-2 py-1 text-xs bg-base-100 text-base-content"
                      >
                        {ROLE_OPTIONS.filter((r) => r !== "OWNER").map((role) => (
                          <option key={role} value={role}>
                            {t(`team.roles.${role}`)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleRemove(member.id)}
                        className="rounded p-1 text-error hover:bg-error/10"
                        title={t("team.removeMember")}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    <span className="rounded bg-base-200 px-2 py-0.5 text-xs font-medium text-base-content/80">
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
