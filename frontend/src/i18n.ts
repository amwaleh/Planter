import { useEffect, useState } from "react";

export type Language = "en" | "sw";

const translations = {
  en: {
    overview: "Farm overview",
    projects: "Farm projects",
    crops: "Crop knowledge",
    water: "Water",
    land: "Soil and terrain",
    livestock: "Livestock",
    assistant: "Farm assistant",
    analyze: "Analyze farm",
    useLocation: "Use my location",
    heroTitle: "Know what your land can become.",
    heroBody:
      "Turn one location into an explainable view of weather, climate, terrain, crop fit, and farm risks.",
  },
  sw: {
    overview: "Muhtasari wa shamba",
    projects: "Miradi ya mashamba",
    crops: "Maarifa ya mazao",
    water: "Maji",
    land: "Udongo na mandhari",
    livestock: "Mifugo",
    assistant: "Msaidizi wa shamba",
    analyze: "Chambua shamba",
    useLocation: "Tumia eneo langu",
    heroTitle: "Fahamu uwezo wa ardhi yako.",
    heroBody:
      "Badilisha eneo moja kuwa maelezo yanayoeleweka kuhusu hali ya hewa, tabianchi, ardhi, mazao na hatari za shamba.",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];

export function getLanguage(): Language {
  return localStorage.getItem("planter-language") === "sw" ? "sw" : "en";
}

export function setLanguage(language: Language): void {
  localStorage.setItem("planter-language", language);
  window.dispatchEvent(new CustomEvent("planter-language", { detail: language }));
}

export function useLanguage() {
  const [language, updateLanguage] = useState<Language>(getLanguage);
  useEffect(() => {
    const listener = (event: Event) =>
      updateLanguage((event as CustomEvent<Language>).detail);
    window.addEventListener("planter-language", listener);
    return () => window.removeEventListener("planter-language", listener);
  }, []);
  return {
    language,
    t: (key: TranslationKey) => translations[language][key],
    changeLanguage: setLanguage,
  };
}

