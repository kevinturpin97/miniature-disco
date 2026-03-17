import { Avatar } from '../ui/Avatar';
import { SearchBar } from '../ui/SearchBar';
import { Bell } from 'lucide-react';
import { useAuthStore } from '@core/stores/useAuthStore';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import { motion } from 'framer-motion';

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const { unreadCount, setOpen } = useNotificationsStore();

  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b border-white/[0.08] bg-dark-base/80 backdrop-blur-sm flex-shrink-0">
      {title && (
        <h1 className="text-lg font-semibold text-white mr-4 hidden sm:block">
          {title}
        </h1>
      )}
      <div className="flex-1 max-w-sm">
        <SearchBar
          placeholder="Search plants, rooms..."
          onSearch={() => {
            /* global search handler */
          }}
        />
      </div>
      <div className="flex items-center gap-3 ml-auto">
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => setOpen(true)}
          className="relative p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/5 transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-neon-pink text-dark-base text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </motion.button>
        {user && <Avatar name={user.name} src={user.avatar} size="sm" />}
      </div>
    </header>
  );
}
