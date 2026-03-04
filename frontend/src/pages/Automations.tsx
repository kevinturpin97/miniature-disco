/**
 * Automations page — placeholder for Sprint 11.
 */

import { useTranslation } from "react-i18next";

export default function Automations() {
  const { t: tp } = useTranslation("pages");

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{tp("automations.title")}</h1>
      <p className="mt-2 text-sm text-gray-500">{tp("automations.subtitle")}</p>
    </div>
  );
}
