// Persistent sessions survive browser restarts; temporary sessions remain in this tab.
export const readSession = (key) => sessionStorage.getItem(key) || localStorage.getItem(key);
export const clearSession = () => {
    for (const storage of [localStorage, sessionStorage])
        for (const key of ['token', 'user', 'teacher']) storage.removeItem(key);
};
export function writeSession(token, user, remember = true) {
    clearSession();
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('token', token);
    storage.setItem('user', JSON.stringify(user));
}
export function saveUser(user) {
    const storage = sessionStorage.getItem('token') ? sessionStorage : localStorage;
    storage.setItem('user', JSON.stringify(user));
}
