/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--action) / <alpha-value>)',
        focus: 'rgb(var(--focus) / <alpha-value>)',
        accent: 'rgb(var(--hover) / <alpha-value>)',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        bgSoft: 'rgb(var(--page) / <alpha-value>)',
        card: 'rgb(var(--surface) / <alpha-value>)',
        // Light-only tint variables; fallbacks retain the original Dark colours.
        blue: { 500: 'rgb(var(--info-tint, 59 130 246) / <alpha-value>)' },
        purple: { 500: 'rgb(var(--role-accent-tint, 168 85 247) / <alpha-value>)' },
        gray: {
          50: 'rgb(var(--page) / <alpha-value>)',
          100: 'rgb(var(--raised) / <alpha-value>)',
          200: 'rgb(var(--border) / <alpha-value>)',
          300: 'rgb(var(--border-strong) / <alpha-value>)',
          400: 'rgb(var(--subtle) / <alpha-value>)',
          500: 'rgb(var(--muted) / <alpha-value>)',
          600: 'rgb(var(--secondary) / <alpha-value>)',
          700: 'rgb(var(--secondary) / <alpha-value>)',
          800: 'rgb(var(--text) / <alpha-value>)'
        },
        zinc: {
          50: 'rgb(var(--text) / <alpha-value>)',
          100: 'rgb(var(--text) / <alpha-value>)',
          200: 'rgb(var(--secondary) / <alpha-value>)',
          300: 'rgb(var(--secondary) / <alpha-value>)',
          400: 'rgb(var(--muted) / <alpha-value>)',
          500: 'rgb(var(--subtle) / <alpha-value>)',
          600: 'rgb(var(--border-strong) / <alpha-value>)',
          700: 'rgb(var(--hover) / <alpha-value>)',
          800: 'rgb(var(--raised) / <alpha-value>)',
          900: 'rgb(var(--surface) / <alpha-value>)',
          950: 'rgb(var(--page) / <alpha-value>)'
        }
      },
      borderColor: {
        zinc: { 700: 'rgb(var(--border-strong) / <alpha-value>)', 800: 'rgb(var(--border) / <alpha-value>)' }
      },
      backgroundColor: {
        white: 'rgb(var(--action) / <alpha-value>)',
        green: { 900: 'rgb(var(--success-surface) / <alpha-value>)', 950: 'rgb(var(--success-surface) / <alpha-value>)' },
        emerald: { 900: 'rgb(var(--success-surface) / <alpha-value>)', 950: 'rgb(var(--success-surface) / <alpha-value>)' },
        red: { 950: 'rgb(var(--error-surface) / <alpha-value>)' }
      },
      textColor: {
        zinc: { 600: 'rgb(var(--subtle) / <alpha-value>)' },
        white: 'rgb(var(--text) / <alpha-value>)',
        black: 'rgb(var(--on-action) / <alpha-value>)',
        media: '#ffffff',
        ink: '#09090b',
        emerald: { 300: 'rgb(var(--success) / <alpha-value>)', 400: 'rgb(var(--success) / <alpha-value>)' },
        green: { 200: 'rgb(var(--success) / <alpha-value>)', 300: 'rgb(var(--success) / <alpha-value>)', 400: 'rgb(var(--success) / <alpha-value>)' },
        red: { 300: 'rgb(var(--error) / <alpha-value>)', 400: 'rgb(var(--error) / <alpha-value>)' },
        amber: { 300: 'rgb(var(--warning) / <alpha-value>)', 400: 'rgb(var(--warning) / <alpha-value>)' },
        yellow: { 300: 'rgb(var(--warning) / <alpha-value>)', 400: 'rgb(var(--warning) / <alpha-value>)' },
        blue: { 300: 'rgb(var(--info) / <alpha-value>)', 400: 'rgb(var(--info) / <alpha-value>)' },
        purple: { 300: 'rgb(var(--purple) / <alpha-value>)', 400: 'rgb(var(--purple) / <alpha-value>)' }
      }
    },
  },
  plugins: [],
}
