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
      } catch {
        setMessage(t("team.inviteError"));
        setStatus("error");
      }
    }

    accept();
  }, [token, isAuthenticated, fetchOrganizations, navigate, t]);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center text-center">
            <p className="text-base-content">{t("team.loginToAccept")}</p>
            <button
              onClick={() => navigate("/login")}
              className="btn btn-primary btn-sm mt-4"
            >
              {t("team.goToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200">
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body items-center text-center">
          {status === "loading" && (
            <>
              <Spinner className="mx-auto h-8 w-8" />
              <p className="mt-4 text-base-content/60">{t("team.acceptingInvite")}</p>
            </>
          )}
          {status === "success" && (
            <>
              <svg
                className="mx-auto h-12 w-12 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="mt-4 font-medium text-base-content">{message}</p>
              <p className="mt-2 text-sm text-base-content/60">{t("team.redirecting")}</p>
            </>
          )}
          {status === "error" && (
            <>
              <svg
                className="mx-auto h-12 w-12 text-error"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="mt-4 font-medium text-error">{message}</p>
              <button
                onClick={() => navigate("/")}
                className="btn btn-primary btn-sm mt-4"
              >
                {t("team.backToDashboard")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
