import type { ReactNode } from "react";

export interface MainLayoutProps {
  topbar: ReactNode;
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  ticker?: ReactNode;
}

export function MainLayout({ topbar, left, center, right, ticker }: MainLayoutProps) {
  return (
    <div className="main-layout">
      {topbar}
      {ticker}
      <main className="main-layout__body">
        {left && <aside className="main-layout__left">{left}</aside>}
        <section className="main-layout__center">{center}</section>
        {right && <aside className="main-layout__right">{right}</aside>}
      </main>
    </div>
  );
}
