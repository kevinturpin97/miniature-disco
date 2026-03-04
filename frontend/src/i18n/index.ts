/**
 * i18n configuration using react-i18next.
 *
 * Supports EN and FR with browser language detection.
 * Two namespaces: "common" for shared UI labels, "pages" for page-specific text.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enPages from "./locales/en/pages.json";
import frCommon from "./locales/fr/common.json";
import frPages from "./locales/fr/pages.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, pages: enPages },
      fr: { common: frCommon, pages: frPages },
    },
    fallbackLng: "en",
    defaultNS: "common",
    ns: ["common", "pages"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
