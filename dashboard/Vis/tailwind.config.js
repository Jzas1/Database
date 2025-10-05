export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        mynt: {
          navy: "#0e2a52",   // adjust if you have the exact hex
          light: "#eef4fb",
          accent: "#2b7fff", // optional bright accent
        },
      },
    },
  },
  plugins: [],
};
