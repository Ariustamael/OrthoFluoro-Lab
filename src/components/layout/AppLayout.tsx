import { NavLink, Outlet } from "react-router-dom";
import { OfflineStatus } from "../common/OfflineStatus";
import { PwaStatus } from "../common/PwaStatus";

const navigation = [
  ["/", "Home"],
  ["/lab", "Lab"],
  ["/guided", "Guided views"],
  ["/library", "Library"],
  ["/about", "About"],
] as const;

export function AppLayout() {
  return (
    <div className="app-shell">
      <OfflineStatus />
      <PwaStatus />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <NavLink aria-label="OrthoFluoro Lab home" className="brand" to="/">
          <span aria-hidden="true" className="brand__mark">
            OF
          </span>
          <span>OrthoFluoro Lab</span>
        </NavLink>
        <nav aria-label="Primary navigation" className="site-nav">
          {navigation.map(([to, label]) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "site-nav__link is-active" : "site-nav__link"
              }
              end={to === "/"}
              key={to}
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink className="settings-link" to="/settings">
          Settings
        </NavLink>
      </header>
      <div id="main-content">
        <Outlet />
      </div>
      <footer className="site-footer">
        <p>
          Educational geometric visualisation only — not for diagnosis,
          patient-specific planning, navigation, or dose calculation.
        </p>
      </footer>
    </div>
  );
}
