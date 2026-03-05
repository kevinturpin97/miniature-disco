/**
 * Sites page — Interactive map with site markers and multi-site dashboard.
 * Uses Leaflet.js for the map and html-to-image for cartographic export.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
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
import type { Site, SiteDashboard, SiteWeatherResponse, WeatherAlert } from "@/types";
import "leaflet/dist/leaflet.css";

// Fix default marker icon for Leaflet in bundled builds
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl;
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
    const bounds = L.latLngBounds(
      sites.map((s) => [s.latitude, s.longitude] as [number, number]),
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  }, [sites, map]);
  return null;
}

function getStatusColor(s: SiteDashboard): string {
  if (s.active_alerts > 0 || s.weather_alerts > 0) return "text-error";
  if (s.zones_online < s.zone_count) return "text-warning";
  return "text-success";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">
            {t("sites.title")}
          </h1>
          <p className="text-sm text-base-content/60">{t("sites.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-outline btn-sm"
            onClick={handleExportMap}
            disabled={exporting || dashboard.length === 0}
          >
            {exporting ? t("sites.exporting") : t("sites.exportMap")}
          </button>
          <button
            className="btn btn-primary btn-sm"
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
      <div className="card bg-base-100 shadow-sm overflow-hidden">
        <div ref={mapRef} className="h-[400px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <span className="loading loading-spinner loading-lg" />
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
              {dashboard.map((site) => (
                <Marker
                  key={site.site_id}
                  position={[site.latitude, site.longitude]}
                  eventHandlers={{ click: () => handleSelectSite(site) }}
                >
                  <Popup>
                    <div className="min-w-[200px]">
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
                          <p className="text-error font-medium">
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
      </div>

      {/* Dashboard grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboard.map((site) => (
          <div
            key={site.site_id}
            className={`card bg-base-100 shadow-sm cursor-pointer transition-shadow hover:shadow-md ${
              selectedSite?.site_id === site.site_id ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => handleSelectSite(site)}
          >
            <div className="card-body p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-base-content">{site.site_name}</h3>
                  <p className="text-xs text-base-content/50">{site.timezone}</p>
                </div>
                <span className={`badge badge-sm ${getStatusColor(site)}`}>
                  {getStatusIcon(site)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-base-content/50">{t("sites.greenhouses")}</span>
                  <p className="font-medium">{site.greenhouse_count}</p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.zones")}</span>
                  <p className="font-medium">
                    {site.zones_online}/{site.zone_count}
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.alerts")}</span>
                  <p className={`font-medium ${site.active_alerts > 0 ? "text-error" : ""}`}>
                    {site.active_alerts}
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.weather")}</span>
                  <p className="font-medium">
                    {site.current_weather
                      ? `${site.current_weather.temperature?.toFixed(1) ?? "—"}°C`
                      : "—"}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex gap-1">
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    const s = sites.find((x) => x.id === site.site_id);
                    if (s) openEdit(s);
                  }}
                >
                  {t("common:actions.edit")}
                </button>
                <button
                  className="btn btn-ghost btn-xs text-error"
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
          <div className="col-span-full text-center py-12 text-base-content/50">
            {t("sites.noSites")}
          </div>
        )}
      </div>

      {/* Weather alerts */}
      {weatherAlerts.length > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h2 className="font-semibold text-base-content mb-3">
              {t("sites.weatherAlerts")}
            </h2>
            <div className="space-y-2">
              {weatherAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-start justify-between rounded-lg border p-3 ${
                    alert.alert_level === "CRITICAL"
                      ? "border-error/30 bg-error/5"
                      : alert.alert_level === "WARNING"
                        ? "border-warning/30 bg-warning/5"
                        : "border-info/30 bg-info/5"
                  }`}
                >
                  <div>
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-xs text-base-content/60 mt-0.5">{alert.message}</p>
                    <p className="text-xs text-base-content/40 mt-0.5">
                      {alert.site_name} &middot; {alert.forecast_date}
                    </p>
                  </div>
                  <button
                    className="btn btn-ghost btn-xs shrink-0"
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                  >
                    {t("common:actions.acknowledge")}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Selected site weather detail */}
      {selectedSite && siteWeather && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h2 className="font-semibold text-base-content mb-3">
              {t("sites.weatherFor", { name: selectedSite.site_name })}
            </h2>
            {siteWeather.current ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-base-content/50">{t("sites.temperature")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.temperature?.toFixed(1) ?? "—"}°C
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.humidity")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.humidity?.toFixed(0) ?? "—"}%
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.precipitation")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.precipitation?.toFixed(1) ?? "—"} mm
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.uvIndex")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.uv_index?.toFixed(1) ?? "—"}
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.windSpeed")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.wind_speed?.toFixed(1) ?? "—"} km/h
                  </p>
                </div>
                <div>
                  <span className="text-base-content/50">{t("sites.condition")}</span>
                  <p className="text-lg font-bold">
                    {siteWeather.current.weather_description}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-base-content/50">{t("sites.noWeather")}</p>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditSite(null);
          resetForm();
        }}
        title={editSite ? t("sites.editSite") : t("sites.addSite")}
      >
        <div className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t("common:labels.name")}</span>
            </label>
            <input
              className="input input-bordered w-full"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Main Farm Site"
            />
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t("sites.address")}</span>
            </label>
            <input
              className="input input-bordered w-full"
              value={formAddress}
              onChange={(e) => setFormAddress(e.target.value)}
              placeholder="123 Farm Road, City"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">{t("sites.latitude")}</span>
              </label>
              <input
                className="input input-bordered w-full"
                type="number"
                step="any"
                value={formLat}
                onChange={(e) => setFormLat(e.target.value)}
                placeholder="48.8566"
              />
            </div>
            <div className="form-control">
              <label className="label">
                <span className="label-text">{t("sites.longitude")}</span>
              </label>
              <input
                className="input input-bordered w-full"
                type="number"
                step="any"
                value={formLng}
                onChange={(e) => setFormLng(e.target.value)}
                placeholder="2.3522"
              />
            </div>
          </div>
          <div className="form-control">
            <label className="label">
              <span className="label-text">{t("sites.timezone")}</span>
            </label>
            <input
              className="input input-bordered w-full"
              value={formTz}
              onChange={(e) => setFormTz(e.target.value)}
              placeholder="Europe/Paris"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="btn btn-ghost"
              onClick={() => {
                setShowCreateModal(false);
                setEditSite(null);
                resetForm();
              }}
            >
              {t("common:actions.cancel")}
            </button>
            <button
              className="btn btn-primary"
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
        isOpen={deleteSiteId !== null}
        onClose={() => setDeleteSiteId(null)}
        onConfirm={handleDelete}
        title={t("common:confirm.deleteTitle")}
        message={t("sites.confirmDelete")}
      />
    </div>
  );
}
