/**
 * Developer Platform page.
 *
 * Three tabs:
 * - API Keys: list, create, revoke, delete, copy raw key on creation.
 * - Webhooks: list, create, edit, delete, delivery history.
 * - Sandbox: sandbox info and links to API docs.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/Spinner";
import type {
  APIKeyData,
  APIKeyScope,
  WebhookData,
  WebhookDeliveryData,
  WebhookEventType,
  SandboxInfo,
} from "@/types";
import * as devApi from "@/api/developer";

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------
type Tab = "apiKeys" | "webhooks" | "sandbox";

const ALL_SCOPES: APIKeyScope[] = ["READ", "WRITE", "ADMIN"];
const ALL_EVENTS: WebhookEventType[] = ["new_reading", "alert_created", "command_ack"];

// ---------------------------------------------------------------------------
// API Keys Tab
// ---------------------------------------------------------------------------

function APIKeysTab({ orgSlug }: { orgSlug: string }) {
  const { t } = useTranslation("pages");
  const [keys, setKeys] = useState<APIKeyData[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newScope, setNewScope] = useState<APIKeyScope>("READ");
  const [newExpiry, setNewExpiry] = useState("");
  const [creating, setCreating] = useState(false);

  // Raw key display
  const [rawKey, setRawKey] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const { data } = await devApi.listAPIKeys(orgSlug);
      setKeys(data.results);
    } catch {
      // error toast handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await devApi.createAPIKey(orgSlug, {
        name: newName.trim(),
        scope: newScope,
        expires_at: newExpiry || null,
      });
      setRawKey(data.raw_key);
      setKeys((prev) => [data.key, ...prev]);
      setNewName("");
      setNewScope("READ");
      setNewExpiry("");
      setShowCreate(false);
      toast.success(t("developer.apiKeys.title") + " created");
    } catch {
      // handled by interceptor
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: number) => {
    try {
      await devApi.revokeAPIKey(orgSlug, id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, is_active: false } : k)));
      toast.success(t("developer.apiKeys.revoke") + "d");
    } catch {
      // handled by interceptor
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await devApi.deleteAPIKey(orgSlug, id);
      setKeys((prev) => prev.filter((k) => k.id !== id));
      toast.success(t("developer.apiKeys.title") + " deleted");
    } catch {
      // handled by interceptor
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(t("developer.apiKeys.keyCopied"));
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Raw key banner */}
      {rawKey && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 shadow-md dark:text-amber-400">
          <svg className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">{t("developer.apiKeys.keyWarning")}</p>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-sm">{rawKey}</code>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors" onClick={() => copyToClipboard(rawKey)}>
              {t("developer.apiKeys.copyKey")}
            </button>
            <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors" onClick={() => setRawKey(null)}>
              {t("actions.dismiss", { ns: "common" })}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("developer.apiKeys.title")}</h3>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors" onClick={() => setShowCreate(true)}>
          {t("developer.apiKeys.createKey")}
        </button>
      </div>

      {/* Table */}
      {keys.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("developer.apiKeys.noKeys")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2">{t("developer.apiKeys.name")}</th>
                <th className="px-3 py-2">{t("developer.apiKeys.prefix")}</th>
                <th className="px-3 py-2">{t("developer.apiKeys.scope")}</th>
                <th className="px-3 py-2">{t("developer.apiKeys.lastUsed")}</th>
                <th className="px-3 py-2">{t("developer.apiKeys.expiresAt")}</th>
                <th className="px-3 py-2">{t("developer.apiKeys.status")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-border last:border-0 even:bg-muted/50">
                  <td className="px-3 py-2 font-medium">{k.name}</td>
                  <td className="px-3 py-2"><code className="text-sm">{k.prefix}...</code></td>
                  <td className="px-3 py-2"><span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{k.scope}</span></td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {k.last_used_at
                      ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })
                      : t("developer.apiKeys.never")}
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">
                    {k.expires_at
                      ? new Date(k.expires_at).toLocaleDateString()
                      : t("developer.apiKeys.noExpiry")}
                  </td>
                  <td className="px-3 py-2">
                    {k.is_active ? (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">{t("developer.apiKeys.active")}</span>
                    ) : (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">{t("developer.apiKeys.revoked")}</span>
                    )}
                  </td>
                  <td className="flex gap-1 px-3 py-2">
                    {k.is_active && (
                      <button className="rounded-lg bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 hover:bg-amber-500/20 transition-colors dark:text-amber-400" onClick={() => handleRevoke(k.id)}>
                        {t("developer.apiKeys.revoke")}
                      </button>
                    )}
                    <button className="rounded-lg border border-destructive px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={() => handleDelete(k.id)}>
                      {t("actions.delete", { ns: "common" })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">{t("developer.apiKeys.createKey")}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.apiKeys.name")}</label>
                <input
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My API Key"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.apiKeys.scope")}</label>
                <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={newScope} onChange={(e) => setNewScope(e.target.value as APIKeyScope)}>
                  {ALL_SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.apiKeys.expiresAt")}</label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  value={newExpiry}
                  onChange={(e) => setNewExpiry(e.target.value)}
                />
                <p className="mt-1 text-xs text-muted-foreground">{t("developer.apiKeys.noExpiry")}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors" onClick={() => setShowCreate(false)}>
                {t("actions.cancel", { ns: "common" })}
              </button>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50" disabled={!newName.trim() || creating} onClick={handleCreate}>
                {creating ? <Spinner className="h-4 w-4" /> : t("actions.create", { ns: "common" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks Tab
// ---------------------------------------------------------------------------

function WebhooksTab({ orgSlug }: { orgSlug: string }) {
  const { t } = useTranslation("pages");
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryData[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEventType[]>([]);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [whRes, delRes] = await Promise.all([
        devApi.listWebhooks(orgSlug),
        devApi.listWebhookDeliveries(orgSlug),
      ]);
      setWebhooks(whRes.data.results);
      setDeliveries(delRes.data.results);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormName("");
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setShowModal(true);
  };

  const openEdit = (wh: WebhookData) => {
    setEditingId(wh.id);
    setFormName(wh.name);
    setFormUrl(wh.url);
    setFormSecret("");
    setFormEvents([...wh.events]);
    setShowModal(true);
  };

  const toggleEvent = (evt: WebhookEventType) => {
    setFormEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt],
    );
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim() || formEvents.length === 0) return;
    setSaving(true);
    try {
      if (editingId) {
        const { data } = await devApi.updateWebhook(orgSlug, editingId, {
          name: formName.trim(),
          url: formUrl.trim(),
          ...(formSecret ? { secret: formSecret } : {}),
          events: formEvents,
        });
        setWebhooks((prev) => prev.map((w) => (w.id === editingId ? data : w)));
        toast.success(t("success.updated", { ns: "common" }));
      } else {
        const { data } = await devApi.createWebhook(orgSlug, {
          name: formName.trim(),
          url: formUrl.trim(),
          ...(formSecret ? { secret: formSecret } : {}),
          events: formEvents,
        });
        setWebhooks((prev) => [data, ...prev]);
        toast.success(t("success.created", { ns: "common" }));
      }
      setShowModal(false);
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await devApi.deleteWebhook(orgSlug, id);
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success(t("success.deleted", { ns: "common" }));
    } catch {
      // handled by interceptor
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("developer.webhooks.title")}</h3>
        <button className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors" onClick={openCreate}>
          {t("developer.webhooks.createWebhook")}
        </button>
      </div>

      {/* Webhooks list */}
      {webhooks.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("developer.webhooks.noWebhooks")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {webhooks.map((wh) => (
            <div key={wh.id} className="rounded-xl border border-border bg-secondary shadow-sm">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-foreground">{wh.name}</h4>
                    <p className="mt-0.5 text-sm text-muted-foreground break-all">{wh.url}</p>
                  </div>
                  {wh.is_active ? (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      {t("developer.apiKeys.active")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t("developer.apiKeys.revoked")}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {wh.events.map((ev) => (
                    <span key={ev} className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                      {t(`developer.webhooks.eventTypes.${ev}`)}
                    </span>
                  ))}
                </div>
                {wh.failure_count > 0 && (
                  <p className="mt-1 text-xs text-destructive">Failures: {wh.failure_count}</p>
                )}
                <div className="mt-2 flex justify-end gap-1">
                  <button className="rounded-lg px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors" onClick={() => openEdit(wh)}>
                    {t("actions.edit", { ns: "common" })}
                  </button>
                  <button className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors" onClick={() => handleDelete(wh.id)}>
                    {t("actions.delete", { ns: "common" })}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deliveries */}
      <div>
        <h3 className="mb-2 text-lg font-semibold">{t("developer.webhooks.deliveries")}</h3>
        {deliveries.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">{t("developer.webhooks.noDeliveries")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2">{t("developer.webhooks.events")}</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">HTTP</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0 even:bg-muted/50">
                    <td className="px-3 py-2"><span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium">{d.event_type}</span></td>
                    <td className="px-3 py-2">
                      {d.status === "SUCCESS" ? (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          {d.status}
                        </span>
                      ) : (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          {d.status}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">{d.response_status ?? "n/a"}</td>
                    <td className="px-3 py-2 text-sm">{d.duration_ms != null ? `${d.duration_ms}ms` : "n/a"}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">
              {editingId ? t("actions.edit", { ns: "common" }) : t("developer.webhooks.createWebhook")}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.webhooks.name")}</label>
                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.webhooks.url")}</label>
                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://example.com/webhook" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.webhooks.secret")}</label>
                <input className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" value={formSecret} onChange={(e) => setFormSecret(e.target.value)} placeholder={t("developer.webhooks.secretPlaceholder")} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">{t("developer.webhooks.events")}</label>
                <div className="flex flex-wrap gap-3 mt-1">
                  {ALL_EVENTS.map((ev) => (
                    <label key={ev} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
                        checked={formEvents.includes(ev)}
                        onChange={() => toggleEvent(ev)}
                      />
                      <span className="text-sm text-foreground">{t(`developer.webhooks.eventTypes.${ev}`)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors" onClick={() => setShowModal(false)}>
                {t("actions.cancel", { ns: "common" })}
              </button>
              <button
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                disabled={!formName.trim() || !formUrl.trim() || formEvents.length === 0 || saving}
                onClick={handleSave}
              >
                {saving ? <Spinner className="h-4 w-4" /> : t("actions.save", { ns: "common" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sandbox Tab
// ---------------------------------------------------------------------------

function SandboxTab() {
  const { t } = useTranslation("pages");
  const [sandbox, setSandbox] = useState<SandboxInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await devApi.getSandboxInfo();
        setSandbox(data);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>;
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">{t("developer.sandbox.title")}</h3>
      <p className="text-muted-foreground">{t("developer.sandbox.description")}</p>

      {error || !sandbox ? (
        <div className="flex items-center gap-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-600 dark:text-sky-400">
          <svg className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{t("developer.sandbox.notAvailable")}</span>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Organization</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{sandbox.name}</p>
            <p className="text-xs text-muted-foreground">{sandbox.slug}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Plan</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{sandbox.plan}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Greenhouses</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{sandbox.greenhouse_count}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Zones</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{sandbox.zone_count}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">API Keys</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{sandbox.api_keys_count}</p>
          </div>
        </div>
      )}

      {/* API Docs links */}
      <div className="rounded-xl border border-border bg-secondary">
        <div className="p-6">
          <h4 className="text-base font-semibold text-foreground">{t("developer.sandbox.apiDocs")}</h4>
          <p className="mt-1 text-sm text-muted-foreground">{t("developer.sandbox.apiDocsDescription")}</p>
          <div className="mt-4 flex gap-2">
            <a href="/api/docs/" target="_blank" rel="noopener noreferrer" className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
              {t("developer.sandbox.swaggerUi")}
            </a>
            <a href="/api/redoc/" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-primary px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors">
              {t("developer.sandbox.redoc")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Developer Page
// ---------------------------------------------------------------------------

function Developer() {
  const { t } = useTranslation("pages");
  const currentOrganization = useAuthStore((s) => s.currentOrganization);
  const orgSlug = currentOrganization?.slug ?? "";
  const [activeTab, setActiveTab] = useState<Tab>("apiKeys");

  if (!orgSlug) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
          <span>{t("team.noOrg")}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("developer.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("developer.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
        <button
          role="tab"
          aria-selected={activeTab === "apiKeys"}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "apiKeys"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("apiKeys")}
        >
          {t("developer.tabs.apiKeys")}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "webhooks"}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "webhooks"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("webhooks")}
        >
          {t("developer.tabs.webhooks")}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "sandbox"}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeTab === "sandbox"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("sandbox")}
        >
          {t("developer.tabs.sandbox")}
        </button>
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-6">
          {activeTab === "apiKeys" && <APIKeysTab orgSlug={orgSlug} />}
          {activeTab === "webhooks" && <WebhooksTab orgSlug={orgSlug} />}
          {activeTab === "sandbox" && <SandboxTab />}
        </div>
      </div>
    </div>
  );
}

export default Developer;
