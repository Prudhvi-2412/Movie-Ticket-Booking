/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          obsidian: '#0D1117',
          container: '#161B22',
          card: '#21262D',
          border: '#30363D',
          muted: '#8B949E',
          crisp: '#F0F6FC',
        },
        crimson: {
          electric: '#FF0055',
          pulse: '#FF5202',
        },
        cyber: {
          gold: '#FFD700',
          cyan: '#00E5FF',
          emerald: '#00F5A0',
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Plus Jakarta Sans', 'sans-serif'],
      },
      boxShadow: {
        'crimson-glow': '0 0 35px rgba(255, 0, 85, 0.35)',
        'crimson-heavy': '0 0 50px rgba(255, 0, 85, 0.6), 0 0 20px rgba(255, 82, 2, 0.5)',
        'cyan-glow': '0 0 25px rgba(0, 229, 255, 0.35)',
        'gold-glow': '0 0 20px rgba(255, 215, 0, 0.35)',
      },
      animation: {
        'liquid-shimmer': 'shimmer 2.5s infinite linear',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        }
      }
    },
  },
  plugins: [],
};
