/**
 * Main application layout with sidebar, header, bottom nav (mobile),
 * and content area with framer-motion page transitions.
 * Sidebar supports collapsible compact mode on desktop.
 */

import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { OnboardingWizard, useOnboardingVisible } from "@/components/ui/OnboardingWizard";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const location = useLocation();
  const { visible: onboardingVisible, dismiss: dismissOnboarding } = useOnboardingVisible();

  return (
    <div className="flex h-screen bg-background">
      {/* First-login onboarding wizard */}
      <AnimatePresence>
        {onboardingVisible && (
          <OnboardingWizard onDismiss={dismissOnboarding} />
        )}
      </AnimatePresence>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          compact={sidebarCompact}
          onToggleCompact={() => setSidebarCompact((v) => !v)}
        />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 pb-20 md:p-6 lg:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
