/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"]
      },
      colors: {
        brand: {
          50: "#edf7f2",
          100: "#d0ebe0",
          200: "#a3d7c0",
          300: "#6ebd9b",
          400: "#3d9e73",
          500: "#1f6f50",
          600: "#1a5e44",
          700: "#154d38",
          800: "#103d2c",
          900: "#0b2c20"
        },
        danger: {
          50: "#fff5f6",
          100: "#ffe8ec",
          200: "#f2c6ce",
          300: "#e894a2",
          400: "#d45a6f",
          500: "#c71f37",
          600: "#a31328",
          700: "#8a0f21",
          800: "#700c1b",
          900: "#560915"
        },
        surface: {
          page: "#f6f8fa",
          card: "#ffffff",
          muted: "#f9fafb",
          sos: "#fff5f6"
        },
        text: {
          primary: "#1c2328",
          secondary: "#5f6a72",
          muted: "#8a9ba8"
        },
        border: {
          default: "#e4e8eb",
          muted: "#cbd2d8"
        }
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.4" }
        },
        "pulse-sos": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(199, 31, 55, 0.4)" },
          "50%": { boxShadow: "0 0 0 6px rgba(199, 31, 55, 0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      },
      animation: {
        "fade-in-up": "fade-in-up 0.4s ease-out",
        "fade-in-up-delayed": "fade-in-up 0.4s ease-out 0.1s both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "pulse-sos": "pulse-sos 2s ease-in-out infinite",
        shimmer: "shimmer 2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
