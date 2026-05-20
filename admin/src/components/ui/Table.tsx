import React from "react";
import { colors } from "../../constants/colors";

export interface Column<T> {
  key: string;
  header: string;
  width?: number | string;
  render: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
}

export default function Table<T>({ columns, data, keyExtractor, loading, emptyMessage = "No records found" }: TableProps<T>) {
  return (
    <div style={styles.wrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} style={{ ...styles.th, width: col.width }}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={styles.empty}>
                Loading...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={styles.empty}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr key={keyExtractor(row)} style={styles.tr}>
                {columns.map((col) => (
                  <td key={col.key} style={styles.td}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    overflowX: "auto",
    borderRadius: "0 0 10px 10px",
  },
  table: {
    width: "100%",
    minWidth: 640,
    borderCollapse: "collapse",
    fontSize: 13,
  },
  th: {
    padding: "10px 14px",
    textAlign: "left",
    color: colors.textMuted,
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottom: `1px solid ${colors.border}`,
    background: colors.surface,
    whiteSpace: "nowrap",
  },
  tr: {
    borderBottom: `1px solid ${colors.border}`,
  },
  td: {
    padding: "12px 14px",
    color: colors.text,
    verticalAlign: "middle",
  },
  empty: {
    padding: "40px 14px",
    textAlign: "center",
    color: colors.textDim,
  },
};
