import React from "react";
import { NavLink } from "react-router-dom";
import { colors } from "../../constants/colors";

const navItems = [
  { to: "/", label: "Dashboard", icon: "⊞" },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/vendors", label: "Vendors", icon: "🏪" },
  { to: "/cities", label: "Cities", icon: "📍" },
  { to: "/vendor-types", label: "Vendor Types", icon: "🏷️" },
  { to: "/events", label: "Events", icon: "📅" },
  { to: "/guides", label: "Guides", icon: "📖" },
];

export default function Sidebar() {
  return (
    <aside style={styles.sidebar}>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>◈</span>
        <span style={styles.logoText}>NightVibe</span>
        <span style={styles.adminBadge}>Admin</span>
      </div>

      <nav style={styles.nav}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navItemActive : {}),
            })}
          >
            <span style={styles.navIcon}>{icon}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 220,
    minHeight: "100vh",
    background: colors.surface,
    borderRight: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  logo: {
    padding: "24px 20px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    borderBottom: `1px solid ${colors.border}`,
  },
  logoIcon: {
    fontSize: 22,
    color: colors.primary,
  },
  logoText: {
    fontSize: 17,
    fontWeight: 700,
    color: colors.text,
    letterSpacing: -0.3,
  },
  adminBadge: {
    fontSize: 10,
    fontWeight: 600,
    background: colors.primaryDim,
    color: colors.primary,
    border: `1px solid ${colors.primary}`,
    borderRadius: 4,
    padding: "2px 6px",
    marginLeft: 2,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  nav: {
    padding: "12px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    color: colors.textMuted,
    textDecoration: "none",
    fontSize: 14,
    fontWeight: 500,
    transition: "all 0.15s",
  },
  navItemActive: {
    background: colors.primaryDim,
    color: colors.primary,
  },
  navIcon: {
    fontSize: 16,
    width: 20,
    textAlign: "center" as const,
  },
};
