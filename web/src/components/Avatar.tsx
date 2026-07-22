import { initials } from "../lib/format";

/**
 * Profile picture with a gradient-initials fallback — the same treatment the
 * mobile app uses when a user has no `profilePicture`.
 */
export default function Avatar({
  src,
  name,
  size = "md",
  className = "",
}: {
  src?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const cls = `cv-avatar${size === "sm" ? " cv-avatar-sm" : size === "lg" ? " cv-avatar-lg" : ""} ${className}`;
  if (src) return <img className={cls} src={src} alt={name || "avatar"} />;
  return <span className={cls}>{initials(name)}</span>;
}
