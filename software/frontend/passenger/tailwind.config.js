/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#eaeaea",
        "text-primary": "#1a1d1b",
        "text-secondary": "#6d7671",
        vermilion: "#c9382a",
        amber: "#e0a72e",
        green: "#207a59",
        hairline: "#d8dbd9",
        "input-bg": "#f4f4f4",
      },
      fontFamily: {
        fraunces: ["var(--font-fraunces)"],
        inter: ["var(--font-inter)"],
        mono: ["var(--font-jetbrains-mono)"],
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s ease-out",
      },
    },
  },
  plugins: [],
};
