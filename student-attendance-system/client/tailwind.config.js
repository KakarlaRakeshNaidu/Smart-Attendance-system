/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const accent = {
    50: token('accent-soft'),
    100: token('accent-soft'),
    200: token('accent'),
    300: token('accent'),
    400: token('accent'),
    500: token('accent-rgb'),
    600: token('accent-rgb'),
    700: token('accent-rgb'),
    800: token('accent-soft'),
    900: token('accent-soft'),
    950: token('accent-soft')
};
export default {
    content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['IBM Plex Sans', 'Segoe UI', 'sans-serif'],
                mono: ['IBM Plex Mono', 'Consolas', 'monospace']
            },
            colors: {
                primary: token('accent-rgb'),
                focus: token('accent'),
                accent: token('accent-soft'),
                success: token('success'),
                danger: token('error'),
                warning: token('warning'),
                bgSoft: token('page'),
                card: token('surface'),
                zinc: {
                    50: token('text'),
                    100: token('text'),
                    200: token('secondary'),
                    300: token('secondary'),
                    400: token('muted'),
                    500: token('muted'),
                    600: token('subtle'),
                    700: token('hover'),
                    800: token('raised'),
                    900: token('surface'),
                    950: token('page')
                },
                gray: {
                    50: token('page'),
                    100: token('raised'),
                    200: token('border'),
                    300: token('border-strong'),
                    400: token('muted'),
                    500: token('muted'),
                    600: token('secondary'),
                    700: token('secondary'),
                    800: token('text'),
                    900: token('text')
                },
                blue: accent,
                indigo: accent,
                purple: accent,
                violet: accent,
                cyan: accent
            },
            backgroundColor: {
                white: token('action'),
                emerald: { 900: token('success-surface'), 950: token('success-surface') },
                green: { 900: token('success-surface'), 950: token('success-surface') },
                red: { 900: token('error-surface'), 950: token('error-surface') },
                amber: { 900: token('warning-surface'), 950: token('warning-surface') }
            },
            borderColor: {
                zinc: {
                    600: token('border-strong'),
                    700: token('border-strong'),
                    800: token('border'),
                    900: token('border')
                }
            },
            textColor: {
                white: token('text'),
                black: token('on-action'),
                media: '#ffffff',
                ink: '#111716',
                zinc: { 600: token('muted') },
                emerald: { 200: token('success'), 300: token('success'), 400: token('success') },
                green: { 200: token('success'), 300: token('success'), 400: token('success') },
                red: { 200: token('error'), 300: token('error'), 400: token('error') },
                amber: { 200: token('warning'), 300: token('warning'), 400: token('warning') },
                yellow: { 300: token('warning'), 400: token('warning') }
            },
            transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.22,1,0.36,1)' },
            boxShadow: {
                sm: '0 1px 2px rgb(0 0 0 / .035)',
                DEFAULT: '0 2px 8px rgb(0 0 0 / .05)',
                md: '0 4px 16px rgb(0 0 0 / .06)',
                lg: '0 8px 24px rgb(0 0 0 / .08)',
                xl: '0 12px 32px rgb(0 0 0 / .1)',
                '2xl': '0 16px 48px rgb(0 0 0 / .12)'
            }
        }
    },
    plugins: []
};
