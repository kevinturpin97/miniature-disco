import { Bell, Check, CheckCheck, AlertTriangle, Droplets, Activity, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import type { AppNotification } from '@core/types';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/EmptyState';
import { Animated } from '../components/Animated';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const typeConfig: Record<
  AppNotification['type'],
  { icon: typeof Bell; color: string }
> = {
  watering: { icon: Droplets, color: '#7B2FBE' },
  health_alert: { icon: AlertTriangle, color: '#FF4757' },
  fertilizing: { icon: Activity, color: '#39FF14' },
  system: { icon: Info, color: '#00F0FF' },
};

export function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotificationsStore();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Animated preset="slideDown">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-white/50 mt-1">
                {unreadCount} unread
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<CheckCheck size={14} />}
              onAction={markAllAsRead}
            >
              Mark all read
            </Button>
          )}
        </div>
      </Animated>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="You're all caught up! Notifications about your plants will appear here."
        />
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {notifications.map((n, i) => {
              const config = typeConfig[n.type];
              const Icon = config.icon;
              return (
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => markAsRead(n.id)}
                  className={cn(
                    'flex items-start gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200',
                    n.isRead
                      ? 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                      : 'bg-white/[0.06] border-white/[0.12] hover:bg-white/[0.08]',
                  )}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: `${config.color}15`,
                      border: `1px solid ${config.color}30`,
                    }}
                  >
                    <Icon size={18} style={{ color: config.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          n.isRead ? 'text-white/60' : 'text-white',
                        )}
                      >
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <div className="w-2 h-2 rounded-full bg-neon-cyan flex-shrink-0 mt-1.5" />
                      )}
                    </div>
                    <p className="text-xs text-white/40 mt-0.5">{n.message}</p>
                    <p className="text-xs text-white/30 mt-1">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {n.isRead && (
                    <Check
                      size={14}
                      className="text-white/20 flex-shrink-0 mt-1"
                    />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
