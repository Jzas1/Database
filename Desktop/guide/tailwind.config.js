/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        charcoal: '#2F2F2F',
        lavender: '#CFCCD6',
        orange: '#D17A22',
        sage: '#C0D684',
        teal: '#017973',
      },
    },
  },
  plugins: [],
}
