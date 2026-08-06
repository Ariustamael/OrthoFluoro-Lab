import { Link, Outlet } from "react-router-dom";
import { OfflineStatus } from "../common/OfflineStatus";
import { PwaStatus } from "../common/PwaStatus";

export function AppLayout() {
  return (
    <div className="app-shell">
      <OfflineStatus />
      <PwaStatus />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <Link aria-label="OrthoFluoro Lab" className="brand" to="/">
          <span aria-hidden="true" className="brand__mark">
            OF
          </span>
          <span>OrthoFluoro Lab</span>
        </Link>
      </header>
      <div id="main-content">
        <Outlet />
      </div>
    </div>
  );
}
