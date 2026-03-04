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
    <div className="join">
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`btn btn-xs join-item ${
            i18n.language?.startsWith(lang.code)
              ? "btn-primary"
              : "btn-ghost"
          }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
