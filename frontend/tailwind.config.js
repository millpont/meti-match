/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // METI Match brand — matches the mockups: light content with a deep-green/gold
        // identity (dark green nav/sidebar + buttons, gold as the secondary CTA/accent).
        brand: {
          green: "#1f4d3a",       // primary (buttons, header/sidebar, active states)
          greenDark: "#163a2a",   // primary hover
          greenLight: "#eaf3ee",  // pale green tint (icon circles, selected chip fill)
          gold: "#c98a1f",        // accent CTA (e.g. "Contact Supplier")
          bg: "#f7f8f6",          // page background
          panel: "#ffffff",       // cards / panels
          edge: "#e3e6e1",        // borders / dividers
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
