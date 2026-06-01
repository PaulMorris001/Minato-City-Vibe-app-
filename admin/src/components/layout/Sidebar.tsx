import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { colors } from "../../constants/colors";
import { adminApi } from "../../api/admin";

const navItems = [
  { to: "/", label: "Dashboard", icon: "⊞" },
  { to: "/users", label: "Users", icon: "👥" },
  { to: "/vendors", label: "Vendors", icon: "🏪" },
  { to: "/verifications", label: "Verifications", icon: "✓" },
  { to: "/paid-events", label: "Paid Events", icon: "💸" },
  { to: "/reports", label: "Reports", icon: "🚩" },
  { to: "/cities", label: "Cities", icon: "📍" },
  { to: "/vendor-types", label: "Vendor Types", icon: "🏷️" },
  { to: "/events", label: "Events", icon: "📅" },
  { to: "/guides", label: "Guides", icon: "📖" },
  { to: "/analytics", label: "Analytics", icon: "📊" },
];

interface SidebarProps {
  isMobile?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ isMobile = false, open = false, onClose }: SidebarProps) {
  const [openReports, setOpenReports] = useState<number>(0);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const res = await adminApi.getReports({ status: "open", page: 1, limit: 1 });
        if (active) setOpenReports(res.data.openCount || 0);
      } catch {
        // ignore — sidebar badge is best-effort
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, open]);

  if (!isMobile) {
    return (
      <aside style={styles.sidebar}>
        <SidebarContent openReports={openReports} />
      </aside>
    );
  }

  return (
    <>
      {open && <div style={styles.overlay} onClick={onClose} />}
      <aside
        style={{
          ...styles.sidebar,
          ...styles.sidebarMobile,
          transform: open ? "translateX(0)" : "translateX(-100%)",
        }}
      >
        <SidebarContent openReports={openReports} onNavigate={onClose} />
      </aside>
    </>
  );
}

function SidebarContent({
  openReports,
  onNavigate,
}: {
  openReports: number;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div style={styles.logo}>
        <span style={styles.logoIcon}>◈</span>
        <span style={styles.logoText}>CityVibe</span>
        <span style={styles.adminBadge}>Admin</span>
      </div>

      <nav style={styles.nav}>
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navItemActive : {}),
            })}
          >
            <span style={styles.navIcon}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {to === "/reports" && openReports > 0 ? (
              <span style={styles.badge}>{openReports}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </>
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
  sidebarMobile: {
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    width: 260,
    maxWidth: "82vw",
    zIndex: 1001,
    transition: "transform 0.22s ease-out",
    overflowY: "auto",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 1000,
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
  badge: {
    fontSize: 11,
    fontWeight: 700,
    background: "#ef4444",
    color: "#fff",
    borderRadius: 10,
    padding: "1px 8px",
    minWidth: 20,
    textAlign: "center" as const,
  },
};
