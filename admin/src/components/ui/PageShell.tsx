import React from "react";
import { colors } from "../../constants/colors";

interface PageShellProps {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export default function PageShell({ toolbar, children }: PageShellProps) {
  return (
    <div style={styles.container}>
      {toolbar && <div style={styles.toolbar}>{toolbar}</div>}
      <div style={styles.card}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: "flex", flexDirection: "column", gap: 16 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    overflow: "hidden",
  },
};
