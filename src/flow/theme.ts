/**
 * Theme system for the SmartComply Flow widget.
 * Maps to backend's SDKConfig.THEME_CHOICES:
 *   default, midnight_blue, sunset_gold, forest_emerald
 */

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryGlow: string;
  bg: string;
  cardBg: string;
  inputBg: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderFocus: string;
  success: string;
  successBg: string;
  error: string;
  errorBg: string;
  warning: string;
  overlay: string;
  shimmer: string;
  shadow: string;
  isDark: boolean;
}

export const THEMES: Record<string, ThemeColors> = {
  default: {
    primary: "#3b82f6",
    primaryHover: "#2563eb",
    primaryGlow: "rgba(59, 130, 246, 0.25)",
    bg: "#ffffff",
    cardBg: "#f8fafc",
    inputBg: "#f1f5f9",
    text: "#0f172a",
    textSecondary: "#475569",
    textMuted: "#94a3b8",
    border: "#e2e8f0",
    borderFocus: "#3b82f6",
    success: "#22c55e",
    successBg: "rgba(34, 197, 94, 0.1)",
    error: "#ef4444",
    errorBg: "rgba(239, 68, 68, 0.1)",
    warning: "#f59e0b",
    overlay: "rgba(15, 23, 42, 0.6)",
    shimmer: "rgba(59, 130, 246, 0.08)",
    shadow: "0 20px 60px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05)",
    isDark: false,
  },

  midnight_blue: {
    primary: "#60a5fa",
    primaryHover: "#93bbfd",
    primaryGlow: "rgba(96, 165, 250, 0.2)",
    bg: "#0b1120",
    cardBg: "#111d33",
    inputBg: "#162032",
    text: "#f1f5f9",
    textSecondary: "#94a3b8",
    textMuted: "#64748b",
    border: "#1e3a5f",
    borderFocus: "#60a5fa",
    success: "#4ade80",
    successBg: "rgba(74, 222, 128, 0.1)",
    error: "#f87171",
    errorBg: "rgba(248, 113, 113, 0.1)",
    warning: "#fbbf24",
    overlay: "rgba(0, 0, 0, 0.75)",
    shimmer: "rgba(96, 165, 250, 0.06)",
    shadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(96, 165, 250, 0.1)",
    isDark: true,
  },

  sunset_gold: {
    primary: "#f59e0b",
    primaryHover: "#d97706",
    primaryGlow: "rgba(245, 158, 11, 0.2)",
    bg: "#fffdf7",
    cardBg: "#fef9ee",
    inputBg: "#fef3c7",
    text: "#1c1917",
    textSecondary: "#57534e",
    textMuted: "#a8a29e",
    border: "#fed7aa",
    borderFocus: "#f59e0b",
    success: "#22c55e",
    successBg: "rgba(34, 197, 94, 0.1)",
    error: "#ef4444",
    errorBg: "rgba(239, 68, 68, 0.1)",
    warning: "#f59e0b",
    overlay: "rgba(28, 25, 23, 0.6)",
    shimmer: "rgba(245, 158, 11, 0.08)",
    shadow: "0 20px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(245, 158, 11, 0.1)",
    isDark: false,
  },

  forest_emerald: {
    primary: "#10b981",
    primaryHover: "#059669",
    primaryGlow: "rgba(16, 185, 129, 0.2)",
    bg: "#f7fdf9",
    cardBg: "#ecfdf5",
    inputBg: "#d1fae5",
    text: "#1a1a2e",
    textSecondary: "#4b5563",
    textMuted: "#9ca3af",
    border: "#a7f3d0",
    borderFocus: "#10b981",
    success: "#22c55e",
    successBg: "rgba(34, 197, 94, 0.1)",
    error: "#ef4444",
    errorBg: "rgba(239, 68, 68, 0.1)",
    warning: "#f59e0b",
    overlay: "rgba(26, 26, 46, 0.6)",
    shimmer: "rgba(16, 185, 129, 0.08)",
    shadow: "0 20px 60px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(16, 185, 129, 0.1)",
    isDark: false,
  },
};

export function getTheme(name: string): ThemeColors {
  return THEMES[name] || THEMES.default;
}
