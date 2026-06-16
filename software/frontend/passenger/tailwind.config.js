/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      animation: {
        "fade-in-up": "fadeInUp 0.5s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        heartbeat: "heartbeat 1.2s ease-in-out infinite",
        ripple: "ripple 1.8s ease-out infinite",
        "scale-bounce": "scaleBounce 0.6s ease-out",
        float: "float 3s ease-in-out infinite",
      },
      keyframes: {
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "14%": { transform: "scale(1.25)" },
          "28%": { transform: "scale(1)" },
          "42%": { transform: "scale(1.25)" },
          "70%": { transform: "scale(1)" },
        },
        ripple: {
          "0%": { transform: "scale(0.8)", opacity: "0.5" },
          "100%": { transform: "scale(2.8)", opacity: "0" },
        },
        scaleBounce: {
          "0%": { transform: "scale(0)", opacity: "0" },
          "50%": { transform: "scale(1.2)" },
          "70%": { transform: "scale(0.95)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
          "50%": { transform: "translateY(-20px) rotate(5deg)" },
        },
      },
    },
  },
  plugins: [],
};
