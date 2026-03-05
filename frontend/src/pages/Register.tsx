/**
 * Register page with Zod-validated form.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";

const registerSchema = z
  .object({
    username: z.string().min(3, "Username must be at least 3 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState<RegisterForm>({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const result = registerSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof RegisterForm;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await register(form.username, form.email, form.password, form.confirmPassword);
      navigate("/login");
    } catch {
      setServerError(t("errors.registrationFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
            G
          </div>
          <h1 className="mt-4 text-2xl font-bold text-foreground">
            {tp("register.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tp("register.subtitle")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card shadow-sm p-6"
        >
          {serverError && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4">
              <span className="text-sm">{serverError}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-card-foreground">
                {t("labels.username")}
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={handleChange}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.username ? "border-destructive" : "border-input"
                }`}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-destructive">{errors.username}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-card-foreground">
                {t("labels.email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.email ? "border-destructive" : "border-input"
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-card-foreground">
                {t("labels.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.password ? "border-destructive" : "border-input"
                }`}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium text-card-foreground">
                {t("labels.confirmPassword")}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={handleChange}
                className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.confirmPassword ? "border-destructive" : "border-input"
                }`}
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 mt-6"
          >
            {loading ? t("actions.creatingAccount") : t("actions.createAccount")}
          </button>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {tp("register.hasAccount")}{" "}
            <Link to="/login" className="text-primary hover:underline font-medium">
              {tp("register.signInLink")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
