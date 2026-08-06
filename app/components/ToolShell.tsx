import type { ReactNode } from "react";

export function ToolShell({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <main className={compact ? "site-shell compact" : "site-shell"}>
      <header className="topbar">
        <a className="brand" href="https://kevin6.com/" aria-label="Kevin6 home">
          <span className="brand-mark">K6</span>
          <span>kevin6.com</span>
        </a>
        <a className="toolbox-label" href="/toolbox/">
          <span className="live-dot" /> TOOLBOX
        </a>
        <a className="home-link" href="https://kevin6.com/">Main site <span aria-hidden="true">↗</span></a>
      </header>
      {children}
      <footer className="site-footer">
        <span>Kevin6 Toolbox</span>
        <span>Small tools. Clear thinking.</span>
        <span>© 2026 Kevin</span>
      </footer>
    </main>
  );
}

export function ToolHeader({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <section className="tool-header">
      <a href="/toolbox/" className="back-link">← All tools</a>
      <div className="tool-title-row">
        <span className="tool-index">{index}</span>
        <div><h1>{title}</h1><p>{description}</p></div>
      </div>
    </section>
  );
}

export function PrivacyNote() {
  return <p className="privacy-note"><span>●</span> Processed locally in your browser. Your files never leave this device.</p>;
}
