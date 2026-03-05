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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="rounded-xl border border-border bg-card shadow-xl">
          <div className="flex flex-col items-center p-6 text-center">
            <p className="text-foreground">{t("team.loginToAccept")}</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {t("team.goToLogin")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="rounded-xl border border-border bg-card shadow-xl">
        <div className="flex flex-col items-center p-6 text-center">
          {status === "loading" && (
            <>
              <Spinner className="mx-auto h-8 w-8" />
              <p className="mt-4 text-muted-foreground">{t("team.acceptingInvite")}</p>
            </>
          )}
          {status === "success" && (
            <>
              <svg
                className="mx-auto h-12 w-12 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="mt-4 font-medium text-foreground">{message}</p>
              <p className="mt-2 text-sm text-muted-foreground">{t("team.redirecting")}</p>
            </>
          )}
          {status === "error" && (
            <>
              <svg
                className="mx-auto h-12 w-12 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <p className="mt-4 font-medium text-destructive">{message}</p>
              <button
                onClick={() => navigate("/")}
                className="mt-4 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
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
