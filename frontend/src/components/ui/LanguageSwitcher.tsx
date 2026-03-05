/**
 * Language switcher component for the header.
 */

import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex rounded-lg bg-muted p-0.5">
      {LANGUAGES.map((lang) => {
        const isActive = i18n.language?.startsWith(lang.code);
        return (
          <button
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {lang.label}
          </button>
        );
      })}
    </div>
  );
}
