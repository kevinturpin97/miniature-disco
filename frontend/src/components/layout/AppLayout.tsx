/**
 * Main application layout using DaisyUI drawer, with sidebar, header, bottom nav (mobile),
 * and content area with framer-motion page transitions.
 */

import { useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

export function AppLayout() {
  const drawerToggleRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const openSidebar = () => {
    if (drawerToggleRef.current) drawerToggleRef.current.checked = true;
  };

  const closeSidebar = () => {
    if (drawerToggleRef.current) drawerToggleRef.current.checked = false;
  };

  return (
    <div className="drawer lg:drawer-open">
      <input
        id="app-drawer"
        type="checkbox"
        className="drawer-toggle"
        ref={drawerToggleRef}
      />

      {/* Main content area */}
      <div className="drawer-content flex flex-col bg-base-200 min-h-screen">
        <Header onMenuClick={openSidebar} />
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

      {/* Sidebar (drawer side) */}
      <div className="drawer-side z-30">
        <label
          htmlFor="app-drawer"
          className="drawer-overlay"
          aria-label="Close sidebar"
        ></label>
        <Sidebar onClose={closeSidebar} />
      </div>
    </div>
  );
}
