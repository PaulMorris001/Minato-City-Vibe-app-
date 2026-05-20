import React from "react";
import { colors } from "../../constants/colors";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: string;
  onSearch: (value: string) => void;
}

export default function SearchInput({ value, onSearch, placeholder = "Search...", ...rest }: SearchInputProps) {
  return (
    <div style={styles.wrapper}>
      <span style={styles.icon}>🔍</span>
      <input
        {...rest}
        value={value}
        onChange={(e) => onSearch(e.target.value)}
        placeholder={placeholder}
        style={styles.input}
      />
      {value && (
        <button style={styles.clear} onClick={() => onSearch("")}>✕</button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    flex: "1 1 220px",
    maxWidth: 320,
  },
  icon: {
    position: "absolute",
    left: 10,
    fontSize: 13,
    pointerEvents: "none",
  },
  input: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: "8px 36px 8px 32px",
    fontSize: 13,
    color: colors.text,
    outline: "none",
    width: "100%",
  },
  clear: {
    position: "absolute",
    right: 8,
    background: "none",
    border: "none",
    color: colors.textDim,
    cursor: "pointer",
    fontSize: 12,
    padding: "2px 4px",
  },
};
