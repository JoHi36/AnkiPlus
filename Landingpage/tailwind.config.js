import preset from '../shared/config/tailwind.preset.js';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        dark: {
          "base-100": "#161616",
          "base-200": "#161616",
          "base-300": "#252525",
          "base-content": "#e8e8e8",
          "primary": "#0a84ff",
          "primary-content": "#ffffff",
          "secondary": "#40a0ff",
          "accent": "#0071e3",
          "neutral": "#9a9a9a",
          "info": "#4a9eff",
          "success": "#14b8a6",
          "warning": "#fbbf24",
          "error": "#ef4444",
        },
      },
    ],
    darkTheme: "dark",
    base: true,
    styled: true,
    utils: true,
    logs: false,
  },
};
