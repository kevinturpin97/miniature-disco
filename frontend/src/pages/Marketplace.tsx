/**
 * Marketplace page — browse, rate, and clone template configurations.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  listTemplates,
  listCategories,
  cloneTemplate,
  rateTemplate,
} from "@/api/templates";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import type {
  Template,
  TemplateCategory,
  Greenhouse,
  Zone,
} from "@/types";

type SortOption = "-clone_count" | "-avg_rating" | "-created_at" | "name";

function StarRating({
  rating,
  size = "sm",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <svg
        key={i}
        className={`${dim} ${i <= Math.round(rating) ? "text-warning" : "text-base-300"}`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>,
    );
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

function InteractiveStarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
          className="cursor-pointer"
        >
          <svg
            className={`h-6 w-6 transition-colors ${
              i <= (hover || value) ? "text-warning" : "text-base-300"
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

export default function MarketplacePage() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  // Data
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [officialOnly, setOfficialOnly] = useState(false);
  const [sort, setSort] = useState<SortOption>("-clone_count");

  // Detail modal
  const [selected, setSelected] = useState<Template | null>(null);
  const [detailTab, setDetailTab] = useState<"config" | "rating" | "import">("config");
  const [userRating, setUserRating] = useState(0);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  // Clone
  const [cloneZoneId, setCloneZoneId] = useState<number | "">("");
  const [cloneMode, setCloneMode] = useState<"merge" | "replace">("merge");
  const [cloning, setCloning] = useState(false);

  // Load categories + greenhouses/zones on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [catRes, ghRes] = await Promise.all([
          listCategories(),
          listGreenhouses(),
        ]);
        if (cancelled) return;
        setCategories(catRes.results);
        setGreenhouses(ghRes.results);
        const allZones: Zone[] = [];
        for (const gh of ghRes.results) {
          const zRes = await listZones(gh.id);
          allZones.push(...zRes.results);
        }
        if (cancelled) return;
        setZones(allZones);
      } catch {
        // Global interceptor shows toast.error automatically
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch templates when filters change
  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { ordering: sort };
      if (search.trim()) params.search = search.trim();
      if (categoryFilter) params.category = categoryFilter;
      if (officialOnly) params.is_official = true;
      const res = await listTemplates(
        params as Parameters<typeof listTemplates>[0],
      );
      setTemplates(res.results);
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, officialOnly, sort]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Open detail modal
  const openDetail = (tpl: Template) => {
    setSelected(tpl);
    setDetailTab("config");
    setUserRating(tpl.user_rating ?? 0);
    setCloneZoneId(zones.length > 0 ? zones[0].id : "");
    setCloneMode("merge");
  };

  // Rate
  const handleRate = async (score: number) => {
    if (!selected) return;
    setUserRating(score);
    setRatingSubmitting(true);
    try {
      const updated = await rateTemplate(selected.id, score);
      setSelected(updated);
      setTemplates((prev) =>
        prev.map((tpl) => (tpl.id === updated.id ? updated : tpl)),
      );
      toast.success(tp("marketplace.ratingSubmitted"));
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setRatingSubmitting(false);
    }
  };

  // Clone
  const handleClone = async () => {
    if (!selected || !cloneZoneId) return;
    setCloning(true);
    try {
      const res = await cloneTemplate(selected.id, {
        zone_id: Number(cloneZoneId),
        mode: cloneMode,
      });
      toast.success(res.detail);
      setSelected(null);
      fetchTemplates();
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setCloning(false);
    }
  };

  const configSummary = (tpl: Template) => {
    const c = tpl.config;
    return {
      sensors: c.sensors?.length ?? 0,
      actuators: c.actuators?.length ?? 0,
      rules: c.automation_rules?.length ?? 0,
      scenarios: c.scenarios?.length ?? 0,
    };
  };

  if (loading && templates.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-base-content">
          {tp("marketplace.title")}
        </h1>
        <p className="mt-1 text-sm text-base-content/60">
          {tp("marketplace.subtitle")}
        </p>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 bg-base-100 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tp("marketplace.searchPlaceholder")}
          className="input input-bordered input-sm w-full max-w-xs"
        />

        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value ? Number(e.target.value) : "")
          }
          className="select select-bordered select-sm"
        >
          <option value="">{tp("marketplace.allCategories")}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={officialOnly}
            onChange={(e) => setOfficialOnly(e.target.checked)}
            className="checkbox checkbox-sm checkbox-primary"
          />
          {tp("marketplace.officialOnly")}
        </label>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="select select-bordered select-sm"
        >
          <option value="-clone_count">{tp("marketplace.sortPopular")}</option>
          <option value="-avg_rating">{tp("marketplace.sortRating")}</option>
          <option value="-created_at">{tp("marketplace.sortNewest")}</option>
          <option value="name">{tp("marketplace.sortName")}</option>
        </select>
      </div>

      {/* Template Grid */}
      {templates.length === 0 ? (
        <div className="card bg-base-100 shadow-xs p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-base-content/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <p className="mt-4 text-sm text-base-content/60">
            {tp("marketplace.noTemplates")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl, index) => {
            const summary = configSummary(tpl);
            return (
              <motion.div
                key={tpl.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.04 }}
              >
                <div
                  onClick={() => openDetail(tpl)}
                  className="card bg-base-100 shadow-xs cursor-pointer transition-shadow hover:shadow-md h-full"
                >
                  <div className="card-body p-4 space-y-2">
                    {/* Name + badges */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base-content line-clamp-1">
                        {tpl.name}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {tpl.is_official && (
                          <span className="badge badge-primary badge-sm">
                            {tp("marketplace.official")}
                          </span>
                        )}
                        <span className="badge badge-ghost badge-sm">
                          v{tpl.version}
                        </span>
                      </div>
                    </div>

                    {/* Category */}
                    {tpl.category_name && (
                      <span className="badge badge-secondary badge-sm">
                        {tpl.category_name}
                      </span>
                    )}

                    {/* Description */}
                    <p className="text-sm text-base-content/60 line-clamp-2">
                      {tpl.description || tp("marketplace.noDescription")}
                    </p>

                    {/* Rating + clones */}
                    <div className="flex items-center gap-3 text-xs text-base-content/60">
                      <div className="flex items-center gap-1">
                        <StarRating rating={tpl.avg_rating} />
                        <span>({tpl.rating_count})</span>
                      </div>
                      <span className="flex items-center gap-1">
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        {tpl.clone_count}
                      </span>
                    </div>

                    {/* Config summary */}
                    <div className="flex flex-wrap gap-2 text-xs text-base-content/50">
                      <span>{summary.sensors} {tp("marketplace.sensors")}</span>
                      <span>{summary.actuators} {tp("marketplace.actuators")}</span>
                      <span>{summary.rules} {tp("marketplace.rules")}</span>
                      <span>{summary.scenarios} {tp("marketplace.scenarios")}</span>
                    </div>

                    {/* Author */}
                    <p className="text-xs text-base-content/40">
                      {tp("marketplace.by")}{" "}
                      {tpl.organization_name || tpl.created_by_username}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <DetailModal
          template={selected}
          tab={detailTab}
          setTab={setDetailTab}
          userRating={userRating}
          ratingSubmitting={ratingSubmitting}
          onRate={handleRate}
          greenhouses={greenhouses}
          zones={zones}
          cloneZoneId={cloneZoneId}
          setCloneZoneId={setCloneZoneId}
          cloneMode={cloneMode}
          setCloneMode={setCloneMode}
          cloning={cloning}
          onClone={handleClone}
          onClose={() => setSelected(null)}
          t={t}
          tp={tp}
        />
      )}
    </motion.div>
  );
}

/* ---- Detail Modal ---- */

function DetailModal({
  template,
  tab,
  setTab,
  userRating,
  ratingSubmitting,
  onRate,
  greenhouses,
  zones,
  cloneZoneId,
  setCloneZoneId,
  cloneMode,
  setCloneMode,
  cloning,
  onClone,
  onClose,
  t,
  tp,
}: {
  template: Template;
  tab: "config" | "rating" | "import";
  setTab: (t: "config" | "rating" | "import") => void;
  userRating: number;
  ratingSubmitting: boolean;
  onRate: (score: number) => void;
  greenhouses: Greenhouse[];
  zones: Zone[];
  cloneZoneId: number | "";
  setCloneZoneId: (v: number | "") => void;
  cloneMode: "merge" | "replace";
  setCloneMode: (v: "merge" | "replace") => void;
  cloning: boolean;
  onClone: () => void;
  onClose: () => void;
  t: (k: string) => string;
  tp: (k: string) => string;
}) {
  const cfg = template.config;

  return (
    <Modal open title={template.name} onClose={onClose}>
      <div className="space-y-4">
        {/* Header info */}
        <div className="flex flex-wrap items-center gap-2">
          {template.is_official && (
            <span className="badge badge-primary">{tp("marketplace.official")}</span>
          )}
          {template.category_name && (
            <span className="badge badge-secondary">{template.category_name}</span>
          )}
          <span className="badge badge-ghost">v{template.version}</span>
          <div className="flex items-center gap-1">
            <StarRating rating={template.avg_rating} />
            <span className="text-xs text-base-content/60">
              ({template.rating_count})
            </span>
          </div>
          <span className="text-xs text-base-content/60">
            {template.clone_count} {tp("marketplace.clones")}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-base-content/80">{template.description}</p>

        <p className="text-xs text-base-content/40">
          {tp("marketplace.by")}{" "}
          {template.organization_name || template.created_by_username}
        </p>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-base-200 p-1">
          {(["config", "rating", "import"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-primary text-primary-content"
                  : "text-base-content/60 hover:bg-base-300"
              }`}
            >
              {tp(`marketplace.tabs.${key}`)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "config" && (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {/* Sensors */}
            {cfg.sensors?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/60 uppercase mb-1">
                  {tp("marketplace.sensors")} ({cfg.sensors.length})
                </h4>
                <div className="space-y-1">
                  {cfg.sensors.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="badge badge-ghost badge-sm">{s.sensor_type}</span>
                      <span className="text-base-content">{s.label || s.sensor_type}</span>
                      <span className="text-base-content/40">{s.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actuators */}
            {cfg.actuators?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/60 uppercase mb-1">
                  {tp("marketplace.actuators")} ({cfg.actuators.length})
                </h4>
                <div className="space-y-1">
                  {cfg.actuators.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="badge badge-ghost badge-sm">{a.actuator_type}</span>
                      <span className="text-base-content">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Automation rules */}
            {cfg.automation_rules?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/60 uppercase mb-1">
                  {tp("marketplace.rules")} ({cfg.automation_rules.length})
                </h4>
                <div className="space-y-1">
                  {cfg.automation_rules.map((r, i) => (
                    <div key={i} className="text-sm text-base-content/80">
                      <span className="font-medium">{r.name}:</span>{" "}
                      {r.sensor_type} {r.condition} {r.threshold_value} &rarr;{" "}
                      {r.action_command_type} {r.action_actuator_name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scenarios */}
            {cfg.scenarios?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/60 uppercase mb-1">
                  {tp("marketplace.scenarios")} ({cfg.scenarios.length})
                </h4>
                <div className="space-y-1">
                  {cfg.scenarios.map((sc, i) => (
                    <div key={i} className="text-sm">
                      <span className="font-medium text-base-content">{sc.name}</span>
                      <span className="text-base-content/50 ml-1">
                        ({sc.steps?.length ?? 0} {tp("marketplace.steps")})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Changelog */}
            {template.changelog && (
              <div>
                <h4 className="text-xs font-semibold text-base-content/60 uppercase mb-1">
                  {tp("marketplace.changelog")}
                </h4>
                <p className="text-sm text-base-content/70 whitespace-pre-line">
                  {template.changelog}
                </p>
              </div>
            )}
          </div>
        )}

        {tab === "rating" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <StarRating rating={template.avg_rating} size="md" />
              <span className="text-lg font-semibold text-base-content">
                {template.avg_rating.toFixed(1)}
              </span>
              <span className="text-sm text-base-content/60">
                ({template.rating_count} {tp("marketplace.ratings")})
              </span>
            </div>

            <div className="border-t border-base-300 pt-4">
              <h4 className="text-sm font-medium text-base-content mb-2">
                {tp("marketplace.yourRating")}
              </h4>
              <div className="flex items-center gap-3">
                <InteractiveStarRating
                  value={userRating}
                  onChange={onRate}
                />
                {ratingSubmitting && <Spinner className="h-4 w-4" />}
              </div>
            </div>
          </div>
        )}

        {tab === "import" && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-base-content/80 mb-1">
                {tp("marketplace.targetZone")}
              </label>
              <select
                value={cloneZoneId}
                onChange={(e) =>
                  setCloneZoneId(e.target.value ? Number(e.target.value) : "")
                }
                className="select select-bordered select-sm w-full"
              >
                <option value="">{tp("marketplace.selectZone")}</option>
                {greenhouses.map((gh) => (
                  <optgroup key={gh.id} label={gh.name}>
                    {zones
                      .filter((z) => z.greenhouse === gh.id)
                      .map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-base-content/80 mb-1">
                {tp("marketplace.importMode")}
              </label>
              <div className="flex gap-2">
                {(["merge", "replace"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCloneMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      cloneMode === mode
                        ? "bg-primary text-primary-content"
                        : "bg-base-200 text-base-content/60 hover:bg-base-300"
                    }`}
                  >
                    {tp(`marketplace.mode.${mode}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-base-content/40">
                {cloneMode === "merge"
                  ? tp("marketplace.mergeHint")
                  : tp("marketplace.replaceHint")}
              </p>
            </div>

            <button
              onClick={onClone}
              disabled={cloning || !cloneZoneId}
              className="btn btn-primary btn-sm w-full"
            >
              {cloning ? (
                <Spinner className="h-4 w-4" />
              ) : (
                tp("marketplace.importTemplate")
              )}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
