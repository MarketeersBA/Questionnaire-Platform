/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          // ── Dark backgrounds (UI base — unchanged) ─────────────────────
          // WARNING: 'brand.dark' is actually a LIGHT theme background color (#F8FAFC).
          // Do NOT use 'dark:bg-brand-dark' for dark mode backgrounds.
          dark: '#F8FAFC',     // Light App Background (Slate 50)
          surface: '#FFFFFF',  // Pure White Card Surface
          border: '#E2E8F0',   // Light Borders (Slate 200)

          // ── Primary palette ─────────────────────────────────────────────
          blue: '#255E91',  // Lapis Blue  — Primary branding
          red: '#CD393B',  // Brand Red   — Alerts/CTAs (from logo)
          accent: '#CD393B',  // alias of red

          // ── Secondary blues (charts & interactive) ──────────────────────
          chartBlue: '#21A0FF',  // primary.light / primary.charts
          chartBlueMid: '#53B5FF',  // primary.charts light variant
          cyan: '#8ACAEC',  // Baby Blue    — Secondary accent
          blueMedium: '#0070C0',  // interactive links
          blueHover: '#005EA4',  // hover / active states
          blueLight: '#B9DFF4',  // very light blue fills
          bluePale: '#DCEFF9',  // secondary.light — bg / cards
          blueFaintest: '#eefaff',  // lightest blue tint

          // ── Tertiary neutrals + pinks ───────────────────────────────────
          pink: '#E79D9E',  // subtle accents / dividers
          pinkLight: '#EFBEBF',  // light pink fills
          pinkPale: '#F7DEDF',  // very light pink backgrounds
          grey: '#334155',  // Slate 700 — High contrast muted text
          greyMid: '#CBD5E1',  // Slate 300 equivalent
          greyLight: '#F1F5F9',  // Slate 100 equivalent
          titleGrey: '#0F172A',  // Slate 950 — Deep dark titles

          // ── Accent & highlight ──────────────────────────────────────────
          yellow: '#FBC210',  // accent.light — highlight / key info
          glow: '#DE7C7E',  // Light Coral  — Supporting accent

          // ── Indicators ──────────────────────────────────────────────────
          safe: '#2e7d32',  // indicator.safe   — unchanged
          threat: '#CD393B',  // indicator.threat — Brand Red
          warning: '#f58327',  // indicator.warning — unchanged
        }
      },
      fontFamily: {
        // Full brand font stack: Pangram → Segoe UI Black → Open Sans → system
        sans: ['"Pangram Sans"', '"Segoe UI Black"', '"Open Sans"', 'ui-sans-serif', 'system-ui'],
        display: ['"Pangram Sans"', '"Segoe UI Black"', '"Open Sans"', 'ui-sans-serif', 'system-ui'],
      },
      animation: {
        'pulse-slow': 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'subtle-float': 'float 8s ease-in-out infinite',
        'slide-up': 'slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-15px)' },
        }
      },
      boxShadow: {
        'glass': '0 20px 50px -12px rgba(0, 0, 0, 0.05), 0 0 1px 0 rgba(0, 0, 0, 0.05)',
        'premium': '0 10px 30px -5px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.01)',
        'accent-glow': '0 15px 35px -5px rgba(37, 94, 145, 0.12)',
        'inner-soft': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)',
      }
    },
  },
  plugins: [],
}
