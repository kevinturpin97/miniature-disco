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
import toast from "react-hot-toast";
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
      // Global interceptor shows toast.error automatically
    } finally {
      setLoading(false);
    }
  }, [currentOrg, tc]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManage =
    currentOrg?.my_role === "OWNER" || currentOrg?.my_role === "ADMIN";

  // -- Channel handlers --

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
      toast.success(tc("success.saved"));
      await loadData();
    } catch {
      // Global interceptor shows toast.error automatically
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
      // Global interceptor shows toast.error automatically
    }
  }

  // -- Rule handlers --

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
      toast.success(tc("success.saved"));
      await loadData();
    } catch {
      // Global interceptor shows toast.error automatically
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
      // Global interceptor shows toast.error automatically
    }
  }

  // -- Delete handler --

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
      toast.success(tc("success.deleted"));
      await loadData();
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setDeleting(false);
    }
  }

  // -- Multi-select toggle helper --

  function toggleArrayItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((v) => v !== item) : [...arr, item];
  }

  if (!currentOrg) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("team.noOrg")}</p>
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
        <h1 className="text-2xl font-bold text-foreground">
          {t("notifications.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("notifications.subtitle", { org: currentOrg.name })}
        </p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-4">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium ${
                tab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground/80"
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
          {/* -- Channels Tab -- */}
          {tab === "channels" && (
            <div className="space-y-4">
              {/* Web Push Subscription Card */}
              {push.state !== "unsupported" && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t("notifications.pushTitle")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {push.state === "denied"
                        ? t("notifications.pushDenied")
                        : push.state === "subscribed"
                          ? t("notifications.pushSubscribed")
                          : t("notifications.pushHint")}
                    </p>
                    {push.error && (
                      <p className="mt-1 text-xs text-destructive">{push.error}</p>
                    )}
                  </div>
                  {push.state === "subscribed" ? (
                    <button
                      onClick={push.unsubscribe}
                      className="rounded-lg border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      {t("notifications.pushUnsubscribe")}
                    </button>
                  ) : push.state !== "denied" ? (
                    <button
                      onClick={push.subscribe}
                      className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
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
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {t("notifications.addChannel")}
                  </button>
                </div>
              )}
              {channels.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("notifications.noChannels")}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {channels.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                            ch.channel_type === "EMAIL"
                              ? "bg-info/10 text-info"
                              : ch.channel_type === "WEBHOOK"
                              ? "bg-secondary/10 text-secondary"
                              : "bg-accent/10 text-accent"
                          }`}
                        >
                          {ch.channel_type}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {ch.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
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
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
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
                              className="rounded p-1 text-muted-foreground/60 hover:text-muted-foreground"
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
                              className="rounded p-1 text-destructive/60 hover:text-destructive"
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

          {/* -- Rules Tab -- */}
          {tab === "rules" && (
            <div className="space-y-4">
              {canManage && (
                <div className="flex justify-end">
                  <button
                    onClick={openCreateRule}
                    disabled={channels.length === 0}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {t("notifications.addRule")}
                  </button>
                </div>
              )}
              {rules.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("notifications.noRules")}
                </p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border bg-card">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {rule.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t("notifications.ruleChannel")}: {rule.channel_name}
                          {" — "}
                          {t("notifications.ruleCooldown")}: {rule.cooldown_seconds}s
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rule.alert_types.length === 0 ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t("notifications.allTypes")}
                            </span>
                          ) : (
                            rule.alert_types.map((at) => (
                              <span
                                key={at}
                                className="rounded bg-info/10 px-1.5 py-0.5 text-[10px] text-info"
                              >
                                {at}
                              </span>
                            ))
                          )}
                          {rule.severities.length === 0 ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                              {t("notifications.allSeverities")}
                            </span>
                          ) : (
                            rule.severities.map((s) => (
                              <span
                                key={s}
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  s === "CRITICAL"
                                    ? "bg-destructive/10 text-destructive"
                                    : s === "WARNING"
                                    ? "bg-warning/10 text-warning"
                                    : "bg-info/10 text-info"
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
                              ? "bg-success/10 text-success"
                              : "bg-muted text-muted-foreground"
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
                              className="rounded p-1 text-muted-foreground/60 hover:text-muted-foreground"
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
                              className="rounded p-1 text-destructive/60 hover:text-destructive"
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

          {/* -- Logs Tab -- */}
          {tab === "logs" && (
            <div>
              {logs.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t("notifications.noLogs")}
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border bg-card">
                  <table className="w-full min-w-full text-sm divide-y divide-border">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                          {t("notifications.logDate")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                          {t("notifications.logRule")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                          {t("notifications.logChannel")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                          {tc("status.loading").replace("...", "")}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase text-muted-foreground">
                          {t("notifications.logError")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-foreground/80">
                            {new Date(log.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-sm text-foreground/80">
                            {log.rule_name}
                          </td>
                          <td className="px-4 py-2 text-sm text-foreground/80">
                            {log.channel_name}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                log.status === "SENT"
                                  ? "bg-success/10 text-success"
                                  : "bg-destructive/10 text-destructive"
                              }`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs text-destructive">
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

      {/* -- Channel Modal -- */}
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </FormField>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setChannelModalOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              {tc("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={channelSaving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {channelSaving ? tc("status.loading") : tc("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* -- Rule Modal -- */}
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
            <p className="mb-1 text-sm font-medium text-foreground/80">
              {t("notifications.ruleAlertTypes")}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
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
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {at}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-foreground/80">
              {t("notifications.ruleSeverities")}
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
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
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
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
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setRuleModalOpen(false)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              {tc("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={ruleSaving}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {ruleSaving ? tc("status.loading") : tc("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* -- Delete Confirmation -- */}
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
