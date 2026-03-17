import { useState, useCallback } from 'react';

export function useTabs<T extends string>(initialTab: T, tabs: T[]) {
  const [activeTab, setActiveTab] = useState<T>(initialTab);

  const selectTab = useCallback((tab: T) => { if (tabs.includes(tab)) setActiveTab(tab); }, [tabs]);
  const nextTab = useCallback(() => {
    const idx = tabs.indexOf(activeTab);
    if (idx < tabs.length - 1) setActiveTab(tabs[idx + 1]);
  }, [activeTab, tabs]);
  const prevTab = useCallback(() => {
    const idx = tabs.indexOf(activeTab);
    if (idx > 0) setActiveTab(tabs[idx - 1]);
  }, [activeTab, tabs]);

  return { activeTab, selectTab, nextTab, prevTab, isFirst: activeTab === tabs[0], isLast: activeTab === tabs[tabs.length - 1] };
}
