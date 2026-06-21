/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        // badges
        "badge-free": "badgeFree 2.6s ease-in-out infinite",
        "badge-limit": "badgeLimit 1.6s ease-in-out infinite",
        "badge-pro": "badgePro 3.2s ease-in-out infinite",

        // icon
        "icon-breathe": "iconBreathe 2.8s ease-in-out infinite",
        "icon-wiggle": "iconWiggle 700ms ease-in-out",
      },
      keyframes: {
        badgeFree: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.78" },
        },
        badgeLimit: {
          "0%, 100%": { opacity: "1", transform: "translateY(0)" },
          "50%": { opacity: "0.55", transform: "translateY(-1px)" },
        },
        badgePro: {
          "0%, 100%": {
            opacity: "1",
            filter: "drop-shadow(0 0 0 rgba(16,185,129,0))",
          },
          "50%": {
            opacity: "0.78",
            filter: "drop-shadow(0 0 12px rgba(16,185,129,0.55))",
          },
        },
        iconBreathe: {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.04)" },
        },
        iconWiggle: {
          "0%": { transform: "rotate(0deg)" },
          "35%": { transform: "rotate(-10deg)" },
          "70%": { transform: "rotate(10deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      },
    },
  },
  plugins: [],
};

export default {
  theme: {
    extend: {
      fontFamily: {
        inter: ["Inter", "sans-serif"],
      },
    },
  },
};

