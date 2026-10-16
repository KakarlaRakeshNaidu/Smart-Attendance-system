import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/authContextState';
import api from '../../services/api';
const Context = createContext({ count: null });
export function notificationsChanged() {
    window.dispatchEvent(new Event('notifications:changed'));
    localStorage.setItem('notifications:changed', String(Date.now()));
}
export function NotificationProvider({ children }) {
    const { user } = useAuth();
    const enabled = ['student', 'teacher'].includes(user?.role);
    const [state, setState] = useState({ owner: null, count: null }), [version, setVersion] = useState(0);
    const refresh = useCallback(() => setVersion(v => v + 1), []);
    useEffect(() => {
        if (!enabled) return;
        let active = true;
        const controller = new AbortController();
        api.get('/notifications/unread-count', { signal: controller.signal, timeout: 15000 }).then(r => { if (active) setState({ owner: user.id, count: r.data.unread }); }).catch(() => { if (active) setState({ owner: user.id, count: null }); });
        return () => { active = false; controller.abort(); };
    }, [user?.id, user?.role, enabled, version]);
    useEffect(() => {
        if (!enabled) return;
        const storage = e => { if (e.key === 'notifications:changed') refresh(); };
        const visible = () => { if (document.visibilityState === 'visible') refresh(); };
        const interval = setInterval(visible, 60000);
        window.addEventListener('focus', refresh); window.addEventListener('notifications:changed', refresh);
        window.addEventListener('storage', storage); document.addEventListener('visibilitychange', visible);
        return () => { clearInterval(interval); window.removeEventListener('focus', refresh); window.removeEventListener('notifications:changed', refresh); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', visible); };
    }, [enabled, refresh]);
    return <Context.Provider value={{ count: enabled && state.owner === user?.id ? state.count : null }}>{children}</Context.Provider>;
}
export function NotificationLink({ className = '', onClick }) {
    const { count } = useContext(Context);
    return <Link to="/notifications" onClick={onClick} className={className}>Notifications{count !== null && <span className="ml-2 rounded-full border border-zinc-600 px-2 py-0.5 text-xs" aria-label={`${count} unread notifications`}>{count}</span>}</Link>;
}
