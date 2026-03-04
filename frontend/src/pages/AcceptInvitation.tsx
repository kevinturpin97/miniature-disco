/**
 * Accept invitation page — called via /invite/:token route.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import * as orgApi from "@/api/organizations";
import { Spinner } from "@/components/ui/Spinner";

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("pages");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchOrganizations = useAuthStore((s) => s.fetchOrganizations);
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !isAuthenticated) return;

    async function accept() {
      try {
        const result = await orgApi.acceptInvitation(token!);
        setMessage(result.detail);
        setStatus("success");
        await fetchOrganizations();
        setTimeout(() => navigate("/team"), 2000);
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? t("team.inviteError");
        setMessage(detail);
        setStatus("error");
      }
    }

    accept();
  }, [token, isAuthenticated, fetchOrganizations, navigate, t]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="rounded-lg bg-white p-8 text-center shadow">
          <p className="text-gray-700">{t("team.loginToAccept")}</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t("team.goToLogin")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="rounded-lg bg-white p-8 text-center shadow">
        {status === "loading" && (
          <>
            <Spinner className="mx-auto h-8 w-8" />
            <p className="mt-4 text-gray-600">{t("team.acceptingInvite")}</p>
          </>
        )}
        {status === "success" && (
          <>
            <svg
              className="mx-auto h-12 w-12 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="mt-4 text-gray-900 font-medium">{message}</p>
            <p className="mt-2 text-sm text-gray-500">{t("team.redirecting")}</p>
          </>
        )}
        {status === "error" && (
          <>
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="mt-4 text-red-700 font-medium">{message}</p>
            <button
              onClick={() => navigate("/")}
              className="mt-4 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t("team.backToDashboard")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
