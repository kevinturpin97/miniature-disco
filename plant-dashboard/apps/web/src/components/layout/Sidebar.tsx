import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Leaf,
  Droplets,
  Bell,
  Settings,
  ChevronLeft,
  Sprout,
} from 'lucide-react';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/plants', label: 'Plants', icon: Leaf },
  { path: '/watering', label: 'Watering', icon: Droplets },
  { path: '/notifications', label: 'Alerts', icon: Bell },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const unreadCount = useNotificationsStore((s) => s.unreadCount);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative flex flex-col h-screen bg-dark-surface border-r border-white/[0.08] overflow-hidden flex-shrink-0"
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center gap-3 px-5 py-6',
          collapsed && 'justify-center px-0'
        )}
      >
        <Sprout className="w-7 h-7 text-neon-green flex-shrink-0" />
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="font-display font-bold text-lg text-white overflow-hidden whitespace-nowrap"
            >
              PlantDash
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 flex flex-col gap-1">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={cn(
                'relative flex items-center gap-3 h-10 rounded-xl transition-all duration-200',
                collapsed ? 'justify-center px-0' : 'px-3',
                isActive
                  ? 'bg-neon-cyan/10 text-neon-cyan'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute inset-0 bg-neon-cyan/10 rounded-xl"
                  transition={{
                    type: 'spring',
                    bounce: 0.2,
                    duration: 0.4,
                  }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <div className="relative">
                  <Icon size={18} />
                  {item.path === '/notifications' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-neon-pink text-dark-base text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium overflow-hidden whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse button */}
      <div className="p-3 border-t border-white/[0.08]">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            'flex items-center gap-3 h-10 w-full rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors',
            collapsed ? 'justify-center' : 'px-3'
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChevronLeft size={18} />
          </motion.div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
