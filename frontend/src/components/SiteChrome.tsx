import { Leaf } from "lucide-react";
import { useLanguage } from "../i18n";
import { appHref } from "../routing";
import { useAuth } from "../auth-context";

export function SiteHeader() {
  const { language, t, changeLanguage } = useLanguage();
  const { account, configured, initializing, signOut } = useAuth();
  return (
    <header className="site-header">
      <a className="brand" href={appHref()} aria-label="Planter home">
        <span className="brand-mark">
          <Leaf size={21} />
        </span>
        <span>Planter</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href={appHref()}>{t("overview")}</a>
        <a href={appHref("/farm-projects")}>{t("projects")}</a>
        <a href={appHref("/crop-knowledge")}>{t("crops")}</a>
        <a href={appHref("/water")}>{t("water")}</a>
        <a href={appHref("/land")}>{t("land")}</a>
        <a href={appHref("/livestock")}>{t("livestock")}</a>
        <a href={appHref("/assistant")}>{t("assistant")}</a>
      </nav>
      <div className="header-actions">
        {configured && !initializing && (
          account ? (
            <>
              <span className="account-name">{account.email}</span>
              <button className="auth-button" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <a className="auth-button" href={appHref("/farm-projects")}>
              Sign in
            </a>
          )
        )}
        <button
          className="language-button"
          type="button"
          onClick={() => changeLanguage(language === "en" ? "sw" : "en")}
          aria-label="Change language"
        >
          {language === "en" ? "SW" : "EN"}
        </button>
      </div>
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
