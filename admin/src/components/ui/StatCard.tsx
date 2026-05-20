import React from "react";
import { colors } from "../../constants/colors";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  accent?: string;
}

export default function StatCard({ label, value, icon, accent = colors.primary }: StatCardProps) {
  return (
    <div style={{ ...styles.card, borderTop: `3px solid ${accent}` }}>
      <div style={styles.iconWrap}>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
      <div>
        <div style={styles.value}>{value}</div>
        <div style={styles.label}>{label}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: "18px 20px",
    display: "flex",
    alignItems: "center",
    gap: 14,
    flex: "1 1 140px",
    minWidth: 140,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    background: colors.bg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    color: colors.text,
    lineHeight: 1.2,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: 500,
  },
};
