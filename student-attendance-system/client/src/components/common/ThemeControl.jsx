import React, { useEffect, useId, useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

export function ThemeControl() {
    const id = useId();
    const theme = window.attendanceTheme;
    const { preference } = useSyncExternalStore(theme.subscribe, theme.getSnapshot);
    const Icon = { system: Monitor, light: Sun, dark: Moon }[preference];
    return <label htmlFor={id} className="theme-control">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Colour theme</span>
        <select id={id} aria-label="Colour theme" value={preference} onChange={e => theme.setPreference(e.target.value)}>
            <option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option>
        </select>
    </label>;
}

export function ThemeRuntime({ children }) {
    useEffect(() => window.attendanceTheme.start(), []);
    return children;
}
