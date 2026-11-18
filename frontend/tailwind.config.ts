import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Minimal, restrained SaaS neutral + blue palette
        surface: {
          DEFAULT: '#f9fafb',
          dim: '#e5e7eb',
          bright: '#ffffff',
          variant: '#e5e7eb',
          tint: '#4b5563',
          'container-lowest': '#ffffff',
          'container-low': '#f9fafb',
          container: '#f3f4f6',
          'container-high': '#e5e7eb',
          'container-highest': '#d1d5db',
        },
        'on-surface': {
          DEFAULT: '#111827',
          variant: '#6b7280',
        },
        background: '#f9fafb',
        'on-background': '#111827',
        primary: {
          DEFAULT: '#111827',
          navy: '#111827',
          container: '#1f2937',
          fixed: '#e5e7eb',
          'fixed-dim': '#d1d5db',
        },
        'on-primary': {
          DEFAULT: '#ffffff',
          container: '#9ca3af',
          fixed: '#111827',
          'fixed-variant': '#374151',
        },
        secondary: {
          DEFAULT: '#2563eb',
          cobalt: '#2563eb',
          container: '#1d4ed8',
          fixed: '#eff6ff',
          'fixed-dim': '#dbeafe',
        },
        'on-secondary': {
          DEFAULT: '#ffffff',
          container: '#ffffff',
          fixed: '#1e40af',
          'fixed-variant': '#1d4ed8',
        },
        tertiary: {
          DEFAULT: '#111827',
          container: '#1f2937',
          fixed: '#f3f4f6',
          'fixed-dim': '#e5e7eb',
        },
        'on-tertiary': {
          DEFAULT: '#ffffff',
          container: '#9ca3af',
          fixed: '#111827',
          'fixed-variant': '#4b5563',
        },
        error: {
          DEFAULT: '#dc2626',
          container: '#fef2f2',
        },
        'on-error': {
          DEFAULT: '#ffffff',
          container: '#991b1b',
        },
        outline: {
          DEFAULT: '#9ca3af',
          variant: '#d1d5db',
        },
        hairline: '#e5e7eb',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '40px', letterSpacing: '-0.025em', fontWeight: '600' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-lg-mobile': ['20px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'metric-lg': ['26px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['18px', { lineHeight: '26px', letterSpacing: '-0.015em', fontWeight: '600' }],
        'headline-sm': ['15px', { lineHeight: '22px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['15px', { lineHeight: '22px', letterSpacing: '-0.005em', fontWeight: '400' }],
        'body-md': ['14px', { lineHeight: '20px', letterSpacing: '0em', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', letterSpacing: '0em', fontWeight: '400' }],
        'label-md': ['13px', { lineHeight: '18px', letterSpacing: '0em', fontWeight: '500' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '500' }],
        caption: ['11px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '500' }],
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '0.75rem',
        'space-lg': '1rem',
        'space-xl': '1.5rem',
        'space-2xl': '2rem',
        gutter: '1rem',
        'gutter-lg': '1.5rem',
        margin: '1rem',
        'margin-md': '1.5rem',
        'margin-lg': '2rem',
      },
      boxShadow: {
        resting: '0 1px 2px 0 rgba(17, 24, 39, 0.04)',
        interactive: '0 4px 12px -2px rgba(17, 24, 39, 0.08)',
        overlay: '0 12px 28px -6px rgba(17, 24, 39, 0.14), 0 4px 10px -4px rgba(17, 24, 39, 0.06)',
      },
    },
  },
  plugins: [],
};

export default config;
