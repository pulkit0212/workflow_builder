import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: {
        "2xl": "1400px"
      }
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "var(--font-inter)", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        display: ["Work Sans", "sans-serif"],
        "work-sans": ["Work Sans", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "#6C3FF5",
          dark: "#1557B0",
          light: "#E8F0FE",
          foreground: "#FFFFFF"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        // Google Play Console palette
        "gpc-blue":        "#6C3FF5",
        "gpc-blue-dark":   "#5B2FE0",
        "gpc-blue-light":  "#EDE9FE",
        "gpc-green":       "#34A853",
        "gpc-green-light": "#E6F4EA",
        "gpc-red":         "#EA4335",
        "gpc-red-light":   "#FCE8E6",
        "gpc-yellow":      "#FBBC04",
        "gpc-yellow-light":"#FEF7E0",
        "gpc-text":        "#202124",
        "gpc-text-2":      "#5F6368",
        "gpc-border":      "#DADCE0",
        "gpc-bg":          "#F8F9FA",
        "gpc-surface":     "#FFFFFF",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.5rem",
        "3xl": "2rem"
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.12)",
        soft: "0 24px 80px rgba(15, 23, 42, 0.12)"
      },
    }
  },
  plugins: []
};

export default config;
