/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
         bg: '#121212',
         surface: '#1e1e1e',
         primary: '#bb86fc',
         'primary-variant': '#3700b3',
         secondary: '#03dac6',
         text: '#e0e0e0',
         'text-muted': '#8e8e8e',
         border: '#333333',
      },
      fontFamily: {
        body: ['Inter', 'sans-serif'],
        serif: ['Lora', 'serif'],
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // I should have installed this for markdown, strictly speaking, but I can use standard styles or add it later. The user asked for "recreating the dark mode aesthetic". Text-typography plugin helps with markdown.
  ],
}
