import { Leaf } from "lucide-react";
import { useLanguage } from "../i18n";

export function SiteHeader() {
  const { language, t, changeLanguage } = useLanguage();
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Planter home">
        <span className="brand-mark">
          <Leaf size={21} />
        </span>
        <span>Planter</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="/">{t("overview")}</a>
        <a href="/farm-projects">{t("projects")}</a>
        <a href="/crop-knowledge">{t("crops")}</a>
        <a href="/water">{t("water")}</a>
        <a href="/land">{t("land")}</a>
        <a href="/livestock">{t("livestock")}</a>
        <a href="/assistant">{t("assistant")}</a>
      </nav>
      <button
        className="language-button"
        type="button"
        onClick={() => changeLanguage(language === "en" ? "sw" : "en")}
        aria-label="Change language"
      >
        {language === "en" ? "SW" : "EN"}
      </button>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="brand">
        <span className="brand-mark">
          <Leaf size={19} />
        </span>
        Planter
      </div>
      <p>Decision support for Eastern African farms. Verify critical decisions with local experts.</p>
    </footer>
  );
}
