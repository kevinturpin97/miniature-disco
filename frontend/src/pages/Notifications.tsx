/**
 * Notifications settings page — manage channels, rules, and view logs.
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import * as notifApi from "@/api/notifications";
import type {
  NotificationChannel,
  NotificationChannelPayload,
  NotificationRule,
  NotificationRulePayload,
  NotificationLog,
  ChannelType,
  AlertType,
  Severity,
} from "@/types";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormField } from "@/components/ui/FormField";
import { SelectField } from "@/components/ui/SelectField";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const CHANNEL_TYPES: ChannelType[] = ["EMAIL", "WEBHOOK", "TELEGRAM", "PUSH"];
const ALERT_TYPES: AlertType[] = ["HIGH", "LOW", "OFFLINE", "ERROR", "CMD_FAIL"];
const SEVERITIES: Severity[] = ["INFO", "WARNING", "CRITICAL"];

type Tab = "channels" | "rules" | "logs";

export default function Notifications() {
  const { t } = useTranslation("pages");
  const { t: tc } = useTranslation();
  const currentOrg = useAuthStore((s) => s.currentOrganization);

  const [tab, setTab] = useState<Tab>("channels");
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Channel modal state
  const [channelModalOpen, setChannelModalOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);
  const [channelForm, setChannelForm] = useState<NotificationChannelPayload>({
    channel_type: "EMAIL",
    name: "",
    email_recipients: "",
    webhook_url: "",
    webhook_secret: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
  });
  const [channelSaving, setChannelSaving] = useState(false);

  // Rule modal state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [ruleForm, setRuleForm] = useState<NotificationRulePayload>({
    name: "",
    channel: 0,
    alert_types: [],
    severities: [],
    cooldown_seconds: 300,
  });
  const [ruleSaving, setRuleSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "channel" | "rule";
    id: number;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const push = usePushNotifications();

  const loadData = useCallback(async () => {
    if (!currentOrg) return;
    setLoading(true);
    setError(null);
    try {
      const [ch, rl, lg] = await Promise.all([
        notifApi.listChannels(currentOrg.slug),
        notifApi.listRules(currentOrg.slug),
        notifApi.listLogs(currentOrg.slug),
      ]);
      setChannels(ch.results);
      setRules(rl.results);
      setLogs(lg.results);
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

  // ── Channel handlers ──────────────────────────────────────────

  function openCreateChannel() {
    setEditingChannel(null);
    setChannelForm({
      channel_type: "EMAIL",
      name: "",
      email_recipients: "",
      webhook_url: "",
      webhook_secret: "",
      telegram_bot_token: "",
      telegram_chat_id: "",
    });
    setChannelModalOpen(true);
  }

  function openEditChannel(ch: NotificationChannel) {
    setEditingChannel(ch);
    setChannelForm({
      channel_type: ch.channel_type,
      name: ch.name,
      email_recipients: ch.email_recipients || "",
      webhook_url: ch.webhook_url || "",
      webhook_secret: "",
      telegram_bot_token: "",
      telegram_chat_id: ch.telegram_chat_id || "",
    });
    setChannelModalOpen(true);
  }

  async function handleSaveChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setChannelSaving(true);
    try {
      if (editingChannel) {
        const payload: Partial<NotificationChannelPayload> = {
          name: channelForm.name,
        };
        if (channelForm.channel_type === "EMAIL") {
          payload.email_recipients = channelForm.email_recipients;
        } else if (channelForm.channel_type === "WEBHOOK") {
          payload.webhook_url = channelForm.webhook_url;
          if (channelForm.webhook_secret) {
            payload.webhook_secret = channelForm.webhook_secret;
          }
        } else if (channelForm.channel_type === "TELEGRAM") {
          if (channelForm.telegram_bot_token) {
            payload.telegram_bot_token = channelForm.telegram_bot_token;
          }
          payload.telegram_chat_id = channelForm.telegram_chat_id;
        }
        await notifApi.updateChannel(currentOrg.slug, editingChannel.id, payload);
      } else {
        await notifApi.createChannel(currentOrg.slug, channelForm);
      }
      setChannelModalOpen(false);
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    } finally {
      setChannelSaving(false);
    }
  }

  async function handleToggleChannel(ch: NotificationChannel) {
    if (!currentOrg) return;
    try {
      await notifApi.updateChannel(currentOrg.slug, ch.id, {
        is_active: !ch.is_active,
      });
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    }
  }

  // ── Rule handlers ─────────────────────────────────────────────

  function openCreateRule() {
    setEditingRule(null);
    setRuleForm({
      name: "",
      channel: channels[0]?.id ?? 0,
      alert_types: [],
      severities: [],
      cooldown_seconds: 300,
    });
    setRuleModalOpen(true);
  }

  function openEditRule(rule: NotificationRule) {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      channel: rule.channel,
      alert_types: rule.alert_types,
      severities: rule.severities,
      cooldown_seconds: rule.cooldown_seconds,
    });
    setRuleModalOpen(true);
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setRuleSaving(true);
    try {
      if (editingRule) {
        await notifApi.updateRule(currentOrg.slug, editingRule.id, ruleForm);
      } else {
        await notifApi.createRule(currentOrg.slug, ruleForm);
      }
      setRuleModalOpen(false);
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    } finally {
      setRuleSaving(false);
    }
  }

  async function handleToggleRule(rule: NotificationRule) {
    if (!currentOrg) return;
    try {
      await notifApi.updateRule(currentOrg.slug, rule.id, {
        is_active: !rule.is_active,
      });
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    }
  }

  // ── Delete handler ────────────────────────────────────────────

  async function handleDelete() {
    if (!currentOrg || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "channel") {
        await notifApi.deleteChannel(currentOrg.slug, deleteTarget.id);
      } else {
        await notifApi.deleteRule(currentOrg.slug, deleteTarget.id);
      }
      setDeleteTarget(null);
      await loadData();
    } catch {
      setError(tc("errors.generic"));
    } finally {
      setDeleting(false);
    }
  }

  // ── Multi-select toggle helper ────────────────────────────────

  function toggleArrayItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
  }

  if (!currentOrg) {
    return (
      <div className="p-6">
        <p className="text-gray-500 dark:text-gray-400">{t("team.noOrg")}</p>
      </div>
    );
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "channels", label: t("notifications.tabs.channels") },
    { key: "rules", label: t("notifications.tabs.rules") },
    { key: "logs", label: t("notifications.tabs.logs") },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("notifications.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("notifications.subtitle", { org: currentOrg.name })}
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-4">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${
                tab === key
                  ? "border-primary-500 text-primary-600"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        <>
          {/* ── Channels Tab ────────────────────────────────── */}
          {tab === "channels" && (
            <div className="space-y-4">
              {/* Web Push Subscription Card */}
              {push.state !== "unsupported" && (
                <div className="flex items-center justify-between rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {t("notifications.pushTitle")}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {push.state === "denied"
                        ? t("notifications.pushDenied")
                        : push.state === "subscribed"
                          ? t("notifications.pushSubscribed")
                          : t("notifications.pushHint")}
                    </p>
                    {push.error && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{push.error}</p>
                    )}
                  </div>
                  {push.state === "subscribed" ? (
                    <button
                      onClick={push.unsubscribe}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                    >
                      {t("notifications.pushUnsubscribe")}
                    </button>
                  ) : push.state !== "denied" ? (
                    <button
                      onClick={push.subscribe}
                      className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
                    >
                      {t("notifications.pushEnable")}
                    </button>
                  ) : null}
                </div>
              )}

              {canManage && (
                <div className="flex justify-end">
                  <button
                    onClick={openCreateChannel}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    {t("notifications.addChannel")}
                  </button>
                </div>
              )}
              {channels.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t("notifications.noChannels")}
                </p>
              ) : (
                <div className="divide-y dark:divide-gray-700 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                  {channels.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                            ch.channel_type === "EMAIL"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : ch.channel_type === "WEBHOOK"
                              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                              : "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                          }`}
                        >
                          {ch.channel_type}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {ch.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {ch.channel_type === "EMAIL" && ch.email_recipients}
                            {ch.channel_type === "WEBHOOK" && ch.webhook_url}
                            {ch.channel_type === "TELEGRAM" &&
                              `Chat: ${ch.telegram_chat_id}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleChannel(ch)}
                          disabled={!canManage}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            ch.is_active
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {ch.is_active
                            ? t("notifications.active")
                            : t("notifications.inactive")}
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEditChannel(ch)}
                              className="rounded p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                              title={tc("actions.edit")}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  type: "channel",
                                  id: ch.id,
                                  name: ch.name,
                                })
                              }
                              className="rounded p-1 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400"
                              title={tc("actions.delete")}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Rules Tab ───────────────────────────────────── */}
          {tab === "rules" && (
            <div className="space-y-4">
              {canManage && (
                <div className="flex justify-end">
                  <button
                    onClick={openCreateRule}
                    disabled={channels.length === 0}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {t("notifications.addRule")}
                  </button>
                </div>
              )}
              {rules.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t("notifications.noRules")}
                </p>
              ) : (
                <div className="divide-y dark:divide-gray-700 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {rule.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {t("notifications.ruleChannel")}: {rule.channel_name}
                          {" — "}
                          {t("notifications.ruleCooldown")}: {rule.cooldown_seconds}s
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rule.alert_types.length === 0 ? (
                            <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                              {t("notifications.allTypes")}
                            </span>
                          ) : (
                            rule.alert_types.map((at) => (
                              <span
                                key={at}
                                className="rounded bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300"
                              >
                                {at}
                              </span>
                            ))
                          )}
                          {rule.severities.length === 0 ? (
                            <span className="rounded bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                              {t("notifications.allSeverities")}
                            </span>
                          ) : (
                            rule.severities.map((s) => (
                              <span
                                key={s}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  s === "CRITICAL"
                                    ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                                    : s === "WARNING"
                                    ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300"
                                    : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                }`}
                              >
                                {s}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleRule(rule)}
                          disabled={!canManage}
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            rule.is_active
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {rule.is_active
                            ? t("notifications.active")
                            : t("notifications.inactive")}
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => openEditRule(rule)}
                              className="rounded p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                              title={tc("actions.edit")}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </button>
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  type: "rule",
                                  id: rule.id,
                                  name: rule.name,
                                })
                              }
                              className="rounded p-1 text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400"
                              title={tc("actions.delete")}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Logs Tab ────────────────────────────────────── */}
          {tab === "logs" && (
            <div>
              {logs.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t("notifications.noLogs")}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          {t("notifications.logDate")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          {t("notifications.logRule")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          {t("notifications.logChannel")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          {tc("status.loading").replace("...", "")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                          {t("notifications.logError")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                            {log.rule_name}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">
                            {log.channel_name}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                log.status === "SENT"
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                  : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-red-600 dark:text-red-400">
                            {log.error_message || "\u2014"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Channel Modal ───────────────────────────────────── */}
      <Modal
        open={channelModalOpen}
        onClose={() => setChannelModalOpen(false)}
        title={
          editingChannel
            ? t("notifications.editChannel")
            : t("notifications.addChannel")
        }
      >
        <form onSubmit={handleSaveChannel} className="space-y-4">
          {!editingChannel && (
            <SelectField
              label={t("notifications.channelType")}
              value={channelForm.channel_type}
              onChange={(v) =>
                setChannelForm({ ...channelForm, channel_type: v as ChannelType })
              }
              options={CHANNEL_TYPES.map((ct) => ({
                value: ct,
                label: t(`notifications.channelTypes.${ct}`),
              }))}
            />
          )}
          <FormField label={tc("labels.name")}>
            <input
              type="text"
              value={channelForm.name}
              onChange={(e) =>
                setChannelForm({ ...channelForm, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </FormField>

          {channelForm.channel_type === "EMAIL" && (
            <FormField label={t("notifications.emailRecipients")}>
              <input
                type="text"
                value={channelForm.email_recipients}
                onChange={(e) =>
                  setChannelForm({
                    ...channelForm,
                    email_recipients: e.target.value,
                  })
                }
                placeholder="user@example.com, admin@example.com"
                required={!editingChannel}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </FormField>
          )}

          {channelForm.channel_type === "WEBHOOK" && (
            <>
              <FormField label={t("notifications.webhookUrl")}>
                <input
                  type="url"
                  value={channelForm.webhook_url}
                  onChange={(e) =>
                    setChannelForm({
                      ...channelForm,
                      webhook_url: e.target.value,
                    })
                  }
                  placeholder="https://hooks.example.com/..."
                  required={!editingChannel}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>
              <FormField label={t("notifications.webhookSecret")}>
                <input
                  type="password"
                  value={channelForm.webhook_secret}
                  onChange={(e) =>
                    setChannelForm({
                      ...channelForm,
                      webhook_secret: e.target.value,
                    })
                  }
                  placeholder={
                    editingChannel
                      ? t("notifications.secretUnchanged")
                      : t("notifications.secretOptional")
                  }
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>
            </>
          )}

          {channelForm.channel_type === "TELEGRAM" && (
            <>
              <FormField label={t("notifications.telegramBotToken")}>
                <input
                  type="password"
                  value={channelForm.telegram_bot_token}
                  onChange={(e) =>
                    setChannelForm({
                      ...channelForm,
                      telegram_bot_token: e.target.value,
                    })
                  }
                  placeholder={
                    editingChannel
                      ? t("notifications.secretUnchanged")
                      : "123456:ABC-DEF..."
                  }
                  required={!editingChannel}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>
              <FormField label={t("notifications.telegramChatId")}>
                <input
                  type="text"
                  value={channelForm.telegram_chat_id}
                  onChange={(e) =>
                    setChannelForm({
                      ...channelForm,
                      telegram_chat_id: e.target.value,
                    })
                  }
                  placeholder="-100123456"
                  required={!editingChannel}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
                />
              </FormField>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setChannelModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {tc("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={channelSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {channelSaving ? tc("status.loading") : tc("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Rule Modal ──────────────────────────────────────── */}
      <Modal
        open={ruleModalOpen}
        onClose={() => setRuleModalOpen(false)}
        title={
          editingRule
            ? t("notifications.editRule")
            : t("notifications.addRule")
        }
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <FormField label={tc("labels.name")}>
            <input
              type="text"
              value={ruleForm.name}
              onChange={(e) =>
                setRuleForm({ ...ruleForm, name: e.target.value })
              }
              required
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </FormField>

          <SelectField
            label={t("notifications.ruleChannel")}
            value={String(ruleForm.channel)}
            onChange={(v) =>
              setRuleForm({ ...ruleForm, channel: Number(v) })
            }
            options={channels.map((ch) => ({
              value: String(ch.id),
              label: `${ch.name} (${ch.channel_type})`,
            }))}
          />

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("notifications.ruleAlertTypes")}
            </p>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {t("notifications.ruleAlertTypesHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {ALERT_TYPES.map((at) => (
                <button
                  key={at}
                  type="button"
                  onClick={() =>
                    setRuleForm({
                      ...ruleForm,
                      alert_types: toggleArrayItem(ruleForm.alert_types, at),
                    })
                  }
                  className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                    ruleForm.alert_types.includes(at)
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {at}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("notifications.ruleSeverities")}
            </p>
            <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {t("notifications.ruleSeveritiesHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() =>
                    setRuleForm({
                      ...ruleForm,
                      severities: toggleArrayItem(ruleForm.severities, sev),
                    })
                  }
                  className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                    ruleForm.severities.includes(sev)
                      ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          <FormField label={t("notifications.ruleCooldown")}>
            <input
              type="number"
              min={10}
              value={ruleForm.cooldown_seconds}
              onChange={(e) =>
                setRuleForm({
                  ...ruleForm,
                  cooldown_seconds: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRuleModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {tc("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={ruleSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {ruleSaving ? tc("status.loading") : tc("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={tc("confirm.deleteTitle")}
        message={t("notifications.confirmDelete", {
          name: deleteTarget?.name ?? "",
        })}
        loading={deleting}
      />
    </div>
  );
}
