import { Leaf } from "lucide-react";

export function SiteHeader() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Planter home">
        <span className="brand-mark">
          <Leaf size={21} />
        </span>
        <span>Planter</span>
      </a>
      <nav aria-label="Primary navigation">
        <a href="/">Farm overview</a>
        <a href="/farm-projects">Farm projects</a>
        <a href="/crop-knowledge">Crop knowledge</a>
      </nav>
      <button className="language-button" type="button">
        EN <span aria-hidden="true">/</span> SW
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
      <p>Decision support for Kenyan farms. Verify critical decisions with local experts.</p>
    </footer>
  );
}

