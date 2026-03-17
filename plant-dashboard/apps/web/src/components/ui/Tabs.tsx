import { useTabs } from '@ui/hooks/useTabs';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (id: string) => void;
  className?: string;
}

export function Tabs({ tabs, defaultTab, onChange, className }: TabsProps) {
  const tabIds = tabs.map((t) => t.id);
  const { activeTab, selectTab } = useTabs<string>(
    defaultTab ?? tabs[0]?.id ?? '',
    tabIds
  );

  const handleSelect = (id: string) => {
    selectTab(id);
    onChange?.(id);
  };

  return (
    <div
      className={cn(
        'flex gap-1 bg-white/5 p-1 rounded-xl border border-white/[0.08] w-fit',
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => handleSelect(tab.id)}
          className={cn(
            'relative flex items-center gap-2 h-9 px-4 text-sm rounded-lg transition-colors duration-200',
            activeTab === tab.id
              ? 'text-white'
              : 'text-white/50 hover:text-white/80'
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute inset-0 bg-white/10 rounded-lg"
              transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
}
