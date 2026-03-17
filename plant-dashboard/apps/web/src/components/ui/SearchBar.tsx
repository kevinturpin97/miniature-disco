import { useInput } from '@ui/hooks/useInput';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface SearchBarProps {
  placeholder?: string;
  onSearch: (query: string) => void;
  value?: string;
  className?: string;
}

export function SearchBar({
  placeholder = 'Search...',
  onSearch,
  value,
  className,
}: SearchBarProps) {
  const { value: query, handleChange, clear } = useInput({
    value,
    onChange: onSearch,
  });
  return (
    <div className={cn('relative flex items-center', className)}>
      <Search
        size={16}
        className="absolute left-3 text-white/30 pointer-events-none"
      />
      <input
        type="search"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 pl-9 pr-10 text-sm rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/40 focus:bg-white/[0.08] transition-all duration-200"
      />
      {query && (
        <button
          onClick={clear}
          className="absolute right-3 p-0.5 text-white/30 hover:text-white/60 transition-colors"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
