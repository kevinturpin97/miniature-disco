/**
 * Login page with Zod-validated form.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useAuthStore } from "@/stores/authStore";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState<LoginForm>({ username: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: undefined });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const result = loginSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof LoginForm;
        fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate("/");
    } catch {
      setServerError(t("errors.invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white text-xl font-bold">
            G
          </div>
          <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-gray-100">
            {tp("login.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {tp("login.subtitle")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm"
        >
          {serverError && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
              {serverError}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.username")}
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                value={form.username}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.username ? "border-red-300 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                }`}
              />
              {errors.username && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.username}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.password")}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100 ${
                  errors.password ? "border-red-300 dark:border-red-500" : "border-gray-300 dark:border-gray-600"
                }`}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.password}</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? t("actions.signingIn") : t("actions.signIn")}
          </button>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            {tp("login.noAccount")}{" "}
            <Link to="/register" className="font-medium text-primary-600 hover:text-primary-700">
              {tp("login.registerLink")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
