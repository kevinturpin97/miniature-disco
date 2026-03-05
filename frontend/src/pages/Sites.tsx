/**
 * Sites page — Interactive map with site markers and multi-site dashboard.
 * Uses Leaflet.js for the map and html-to-image for cartographic export.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { toPng } from "html-to-image";
import toast from "react-hot-toast";
import {
  listSites,
  createSite,
  updateSite,
  deleteSite,
  getSiteDashboard,
  getSiteWeather,
  listWeatherAlerts,
  acknowledgeWeatherAlert,
} from "@/api/sites";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import type { Site, SiteDashboard, SiteWeatherResponse, WeatherAlert } from "@/types";
import "leaflet/dist/leaflet.css";

// Fix default marker icon for Leaflet in bundled builds
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/** Fit the map to show all markers. */
function FitBounds({ sites }: { sites: SiteDashboard[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length === 0) return;
    if (sites.length === 1) {
      map.setView([sites[0].latitude, sites[0].longitude], 12);
      return;
    }
    const bounds = L.latLngBounds(
      sites.map((s) => [s.latitude, s.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [sites, map]);
  return null;
}

/** Capture clicks on the map to create a new site at that location. */
function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function getStatusColor(s: SiteDashboard): string {
  if (s.active_alerts > 0 || s.weather_alerts > 0) return "text-destructive";
  if (s.zones_online < s.zone_count) return "text-amber-500";
  return "text-emerald-500";
}

function getStatusIcon(s: SiteDashboard): string {
  if (s.active_alerts > 0 || s.weather_alerts > 0) return "!";
  if (s.zones_online < s.zone_count) return "~";
  return "OK";
}

export default function Sites() {
  const { t } = useTranslation(["pages", "common"]);
  const mapRef = useRef<HTMLDivElement>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [dashboard, setDashboard] = useState<SiteDashboard[]>([]);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);
  const [selectedSite, setSelectedSite] = useState<SiteDashboard | null>(null);
  const [siteWeather, setSiteWeather] = useState<SiteWeatherResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deleteSiteId, setDeleteSiteId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formLat, setFormLat] = useState("");
  const [formLng, setFormLng] = useState("");
  const [formTz, setFormTz] = useState("UTC");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sitesRes, dashRes, alertsRes] = await Promise.all([
        listSites(),
        getSiteDashboard(),
        listWeatherAlerts({ acknowledged: false }),
      ]);
      setSites(sitesRes.results);
      setDashboard(dashRes);
      setWeatherAlerts(alertsRes.results);
    } catch {
      // Error toast handled by client interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectSite = useCallback(async (site: SiteDashboard) => {
    setSelectedSite(site);
    try {
      const weather = await getSiteWeather(site.site_id);
      setSiteWeather(weather);
    } catch {
      setSiteWeather(null);
    }
  }, []);

  const resetForm = () => {
    setFormName("");
    setFormAddress("");
    setFormLat("");
    setFormLng("");
    setFormTz("UTC");
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    resetForm();
    setEditSite(null);
    setFormLat(lat.toFixed(6));
    setFormLng(lng.toFixed(6));
    setFormTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    setShowCreateModal(true);

    // Reverse geocode via Nominatim (non-blocking)
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { "Accept-Language": "en" } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) {
          setFormAddress(data.display_name);
        }
      }
    } catch {
      // Geocoding failure is non-critical — address stays empty
    } finally {
      setGeocoding(false);
    }
  }, []);

  const openEdit = (site: Site) => {
    setEditSite(site);
    setFormName(site.name);
    setFormAddress(site.address);
    setFormLat(String(site.latitude));
    setFormLng(String(site.longitude));
    setFormTz(site.timezone);
    setShowCreateModal(true);
  };

  const handleSubmit = async () => {
    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);
    if (isNaN(lat) || isNaN(lng)) {
      toast.error("Invalid coordinates");
      return;
    }
    try {
      if (editSite) {
        await updateSite(editSite.id, {
          name: formName,
          address: formAddress,
          latitude: lat,
          longitude: lng,
          timezone: formTz,
        });
        toast.success(t("common:success.updated"));
      } else {
        await createSite({
          name: formName,
          address: formAddress,
          latitude: lat,
          longitude: lng,
          timezone: formTz,
        });
        toast.success(t("common:success.created"));
      }
      setShowCreateModal(false);
      setEditSite(null);
      resetForm();
      fetchData();
    } catch {
      // handled by interceptor
    }
  };

  const handleDelete = async () => {
    if (!deleteSiteId) return;
    try {
      await deleteSite(deleteSiteId);
      toast.success(t("common:success.deleted"));
      setDeleteSiteId(null);
      fetchData();
    } catch {
      // handled by interceptor
    }
  };

  const handleAcknowledgeAlert = async (id: number) => {
    try {
      await acknowledgeWeatherAlert(id);
      toast.success(t("common:success.acknowledged"));
      setWeatherAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch {
      // handled by interceptor
    }
  };

  const handleExportMap = async () => {
    if (!mapRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(mapRef.current, {
        quality: 0.95,
        backgroundColor: "#ffffff",
      });
      const link = document.createElement("a");
      link.download = `greenhouse-sites-map-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(t("sites.exportSuccess"));
    } catch {
      toast.error(t("sites.exportError"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("sites.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("sites.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            onClick={handleExportMap}
            disabled={exporting || dashboard.length === 0}
          >
            {exporting ? t("sites.exporting") : t("sites.exportMap")}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            onClick={() => {
              resetForm();
              setEditSite(null);
              setShowCreateModal(true);
            }}
          >
            {t("sites.addSite")}
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div ref={mapRef} className="h-96 w-full cursor-crosshair">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="h-8 w-8" />
            </div>
          ) : (
            <MapContainer
              center={[48.8566, 2.3522]}
              zoom={5}
              className="h-full w-full z-0"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds sites={dashboard} />
              <MapClickHandler onClick={handleMapClick} />
              {dashboard.map((site) => (
                <Marker
                  key={site.site_id}
                  position={[site.latitude, site.longitude]}
                  eventHandlers={{ click: () => handleSelectSite(site) }}
                >
                  <Popup>
                    <div className="min-w-50">
                      <h3 className="font-bold text-sm">{site.site_name}</h3>
                      <div className="text-xs mt-1 space-y-0.5">
                        <p>{site.greenhouse_count} {t("sites.greenhouses")} &middot; {site.zone_count} {t("sites.zones")}</p>
                        <p className={getStatusColor(site)}>
                          {site.zones_online}/{site.zone_count} {t("common:status.online").toLowerCase()}
                        </p>
                        {site.current_weather && (
                          <p>
                            {site.current_weather.temperature !== null
                              ? `${site.current_weather.temperature.toFixed(1)}°C`
                              : "—"}{" "}
                            &middot;{" "}
                            {site.current_weather.weather_description}
                          </p>
                        )}
                        {(site.active_alerts > 0 || site.weather_alerts > 0) && (
                          <p className="text-destructive font-medium">
                            {site.active_alerts + site.weather_alerts} {t("sites.activeAlerts")}
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
        <p className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          {t("sites.mapClickHint")}
        </p>
      </div>

      {/* Dashboard grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.map((site) => (
          <div
            key={site.site_id}
            className={`rounded-xl border bg-card cursor-pointer transition-all hover:shadow-md ${
              selectedSite?.site_id === site.site_id
                ? "border-primary/50 ring-2 ring-primary/20"
                : "border-border"
            }`}
            onClick={() => handleSelectSite(site)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{site.site_name}</h3>
                  <p className="text-xs text-muted-foreground">{site.timezone}</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getStatusColor(site)}`}>
                  {getStatusIcon(site)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t("sites.greenhouses")}</p>
                  <p className="font-semibold text-foreground">{site.greenhouse_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("sites.zones")}</p>
                  <p className="font-semibold text-foreground">{site.zones_online}/{site.zone_count}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("sites.alerts")}</p>
                  <p className={`font-semibold ${site.active_alerts > 0 ? "text-destructive" : "text-foreground"}`}>
                    {site.active_alerts}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("sites.weather")}</p>
                  <p className="font-semibold text-foreground">
                    {site.current_weather
                      ? `${site.current_weather.temperature?.toFixed(1) ?? "—"}°C`
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-1 border-t border-border pt-3">
                <button
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    const s = sites.find((x) => x.id === site.site_id);
                    if (s) openEdit(s);
                  }}
                >
                  {t("common:actions.edit")}
                </button>
                <button
                  className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteSiteId(site.site_id);
                  }}
                >
                  {t("common:actions.delete")}
                </button>
              </div>
            </div>
          </div>
        ))}
        {!loading && dashboard.length === 0 && (
          <div className="col-span-full flex justify-center py-12 text-sm text-muted-foreground">
            {t("sites.noSites")}
          </div>
        )}
      </div>

      {/* Weather alerts */}
      {weatherAlerts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {t("sites.weatherAlerts")}
          </h2>
          <div className="space-y-2">
            {weatherAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start justify-between rounded-lg border p-3 ${
                  alert.alert_level === "CRITICAL"
                    ? "border-destructive/30 bg-destructive/5"
                    : alert.alert_level === "WARNING"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : "border-sky-500/30 bg-sky-500/5"
                }`}
              >
                <div>
                  <p className="font-medium text-sm text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {alert.site_name} &middot; {alert.forecast_date}
                  </p>
                </div>
                <button
                  className="ml-3 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  onClick={() => handleAcknowledgeAlert(alert.id)}
                >
                  {t("common:actions.acknowledge")}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Selected site weather detail */}
      {selectedSite && siteWeather && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">
            {t("sites.weatherFor", { name: selectedSite.site_name })}
          </h2>
          {siteWeather.current ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: t("sites.temperature"), value: `${siteWeather.current.temperature?.toFixed(1) ?? "—"}°C` },
                { label: t("sites.humidity"), value: `${siteWeather.current.humidity?.toFixed(0) ?? "—"}%` },
                { label: t("sites.precipitation"), value: `${siteWeather.current.precipitation?.toFixed(1) ?? "—"} mm` },
                { label: t("sites.uvIndex"), value: siteWeather.current.uv_index?.toFixed(1) ?? "—" },
                { label: t("sites.windSpeed"), value: `${siteWeather.current.wind_speed?.toFixed(1) ?? "—"} km/h` },
                { label: t("sites.condition"), value: siteWeather.current.weather_description },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sites.noWeather")}</p>
          )}
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditSite(null);
          resetForm();
        }}
        title={editSite ? t("sites.editSite") : t("sites.addSite")}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t("common:labels.name")}
            </label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Main Farm Site"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t("sites.address")}
            </label>
            <div className="relative">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                placeholder={geocoding ? t("sites.geocoding") : "123 Farm Road, City"}
                disabled={geocoding}
              />
              {geocoding && (
                <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("sites.latitude")}
              </label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                type="number"
                step="any"
                value={formLat}
                onChange={(e) => setFormLat(e.target.value)}
                placeholder="48.8566"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {t("sites.longitude")}
              </label>
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                type="number"
                step="any"
                value={formLng}
                onChange={(e) => setFormLng(e.target.value)}
                placeholder="2.3522"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              {t("sites.timezone")}
            </label>
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={formTz}
              onChange={(e) => setFormTz(e.target.value)}
              placeholder="Europe/Paris"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => {
                setShowCreateModal(false);
                setEditSite(null);
                resetForm();
              }}
            >
              {t("common:actions.cancel")}
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              onClick={handleSubmit}
              disabled={!formName || !formLat || !formLng}
            >
              {editSite ? t("common:actions.save") : t("common:actions.create")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteSiteId !== null}
        onClose={() => setDeleteSiteId(null)}
        onConfirm={handleDelete}
        title={t("common:confirm.deleteTitle")}
        message={t("sites.confirmDelete")}
      />
    </div>
  );
}
