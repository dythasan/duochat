/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dc-bg': '#0B141A',
        'dc-panel': '#111B21',
        'dc-header': '#202C33',
        'dc-sent': '#005C4B',
        'dc-received': '#1F2C34',
        'dc-input': '#2A3942',
        'dc-text': '#E9EDEF',
        'dc-subtext': '#8696A0',
        'dc-border': '#2A3942',
        'dc-green': '#00A884',
        'dc-blue': '#53BDEB',
      },
    },
  },
  plugins: [],
}
