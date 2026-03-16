import sharedConfig from '../shared/config/tailwind.shared.js';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../shared/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      ...sharedConfig.theme?.extend,
      colors: {
        // Anki Chatbot Design-System (Frontend specific)
        'bg-dark': '#161616',
        'bg-panel': '#161616',
        'bg-muted': '#252525',
        'text-primary': '#e8e8e8',
        'text-hint': '#9a9a9a',
        'accent': '#0a84ff',
        'accent-strong': '#0071e3',
        'accent-soft': '#40a0ff',
        // Shared colors (merged)
        ...sharedConfig.theme?.extend?.colors,
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'xl': '22px',
        'lg': '18px',
        'md': '12px',
        'sm': '8px',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        shimmer: 'shimmer 3s ease-in-out infinite',
      },
    },
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

