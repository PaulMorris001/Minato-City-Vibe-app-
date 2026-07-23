import React from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { colors } from "../../constants/colors";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/vendors": "Vendors",
  "/verifications": "Verifications",
  "/paid-events": "Paid Events",
  "/event-edits": "Event Edits",
  "/reports": "Reports",
  "/cities": "Cities",
  "/vendor-types": "Vendor Types",
  "/events": "Events",
  "/guides": "Guides",
  "/analytics": "Analytics",
};

interface HeaderProps {
  isMobile?: boolean;
  onMenuClick?: () => void;
}

export default function Header({ isMobile = false, onMenuClick }: HeaderProps) {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const title = PAGE_TITLES[pathname] ?? "Admin";

  return (
    <header
      style={{
        ...styles.header,
        padding: isMobile ? "0 12px" : "0 24px",
      }}
    >
      <div style={styles.left}>
        {isMobile && (
          <button
            style={styles.menuBtn}
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <span style={styles.menuIcon}>☰</span>
          </button>
        )}
        <h1 style={{ ...styles.title, fontSize: isMobile ? 16 : 18 }}>{title}</h1>
      </div>
      <button
        style={{ ...styles.logoutBtn, padding: isMobile ? "6px 10px" : "6px 14px" }}
        onClick={logout}
      >
        Sign out
      </button>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: 56,
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  menuBtn: {
    background: "none",
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: colors.text,
    cursor: "pointer",
    flexShrink: 0,
  },
  menuIcon: {
    fontSize: 18,
    lineHeight: 1,
  },
  title: {
    fontWeight: 600,
    color: colors.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  logoutBtn: {
    background: "none",
    border: `1px solid ${colors.border}`,
    color: colors.textMuted,
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    flexShrink: 0,
  },
};
