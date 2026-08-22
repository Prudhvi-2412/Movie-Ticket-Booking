/** @type {import('tailwindcss').Config} */

/**
 * CineWave design tokens.
 *
 * One accent colour (brand), one positive, one caution, one negative — every
 * other hue in the UI is a neutral. Restricting the palette this hard is what
 * keeps a dashboard, a seat map and a ticket looking like the same product.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Neutrals — the surface stack, darkest to lightest.
        ink: {
          950: '#08090D',  // page background
          900: '#0E1016',  // sunken
          850: '#141720',  // card
          800: '#1B1F2A',  // elevated card / input
          700: '#252A38',  // border strong
          600: '#333949',  // border
          500: '#4A5163',
          400: '#6B7488',
          300: '#9AA2B5',  // muted text
          200: '#C6CCD9',
          100: '#E6E9F0',
          50: '#F5F7FA'    // primary text
        },
        brand: {
          50: '#FFF1F3',
          200: '#FFC4CE',
          400: '#FF6B85',
          500: '#FF3B5C',  // primary accent
          600: '#E5203F',
          700: '#BE1533'
        },
        ember: { 400: '#FF9A5A', 500: '#FF7A45' }, // gradient partner
        positive: { 400: '#4ADE9B', 500: '#22C782', 600: '#16A46A' },
        caution: { 400: '#FBBF24', 500: '#F59E0B' },
        negative: { 400: '#F87171', 500: '#EF4444' },
        info: { 400: '#7BA6F5', 500: '#5B8DEF' }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem'
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 12px 32px -12px rgba(0,0,0,0.7)',
        brand: '0 8px 28px -10px rgba(255,59,92,0.55)',
        'brand-sm': '0 0 0 1px rgba(255,59,92,0.35), 0 4px 14px -6px rgba(255,59,92,0.5)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.28s cubic-bezier(0.16,1,0.3,1)',
        'slide-in-right': 'slide-in-right 0.24s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.18s cubic-bezier(0.16,1,0.3,1)'
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)'
      }
    }
  },
  plugins: []
};
