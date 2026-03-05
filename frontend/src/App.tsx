/**
 * Root application component with routing and auth protection.
 * All page routes use React.lazy for code-splitting.
 */

import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/Spinner";
import { AppLayout } from "@/components/layout/AppLayout";

const Login = lazy(() => import("@/pages/Login"));
const Register = lazy(() => import("@/pages/Register"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ZoneDetail = lazy(() => import("@/pages/ZoneDetail"));
const History = lazy(() => import("@/pages/History"));
const Alerts = lazy(() => import("@/pages/Alerts"));
const Commands = lazy(() => import("@/pages/Commands"));
const Automations = lazy(() => import("@/pages/Automations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Team = lazy(() => import("@/pages/Team"));
const Notifications = lazy(() => import("@/pages/Notifications"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Scenarios = lazy(() => import("@/pages/Scenarios"));
const AcceptInvitation = lazy(() => import("@/pages/AcceptInvitation"));
const QuickActions = lazy(() => import("@/pages/QuickActions"));
const Marketplace = lazy(() => import("@/pages/Marketplace"));
const Developer = lazy(() => import("@/pages/Developer"));
const Billing = lazy(() => import("@/pages/Billing"));
const Sites = lazy(() => import("@/pages/Sites"));
const CultureJournal = lazy(() => import("@/pages/CultureJournal"));

function PageFallback() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner className="h-10 w-10" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return <PageFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    return <PageFallback />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppInit({ children }: { children: React.ReactNode }) {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AppInit>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            error: { duration: 5000 },
            style: {
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              fontSize: "0.875rem",
            },
          }}
        />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public routes */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/register"
              element={
                <PublicRoute>
                  <Register />
                </PublicRoute>
              }
            />

            {/* Invitation acceptance (requires auth but no layout) */}
            <Route
              path="/invite/:token"
              element={
                <ProtectedRoute>
                  <AcceptInvitation />
                </ProtectedRoute>
              }
            />

            {/* Protected routes with layout */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="quick-actions" element={<QuickActions />} />
              <Route path="zones/:zoneId" element={<ZoneDetail />} />
              <Route path="history" element={<History />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="commands" element={<Commands />} />
              <Route path="automations" element={<Automations />} />
              <Route path="team" element={<Team />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="scenarios" element={<Scenarios />} />
              <Route path="marketplace" element={<Marketplace />} />
              <Route path="sites" element={<Sites />} />
              <Route path="culture-journal" element={<CultureJournal />} />
              <Route path="developer" element={<Developer />} />
              <Route path="billing" element={<Billing />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppInit>
    </BrowserRouter>
  );
}

export default App;
