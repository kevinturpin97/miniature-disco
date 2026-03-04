/**
 * Language switcher component for the header.
 */

import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-white p-0.5 dark:border-gray-600 dark:bg-gray-800">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            i18n.language?.startsWith(lang.code)
              ? "bg-primary-600 text-white"
              : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
