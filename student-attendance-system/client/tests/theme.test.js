import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../public/theme.js', import.meta.url), 'utf8');
function browser({ saved, dark = false, blocked = false } = {}) {
    const storage = new Map([['token', 'unchanged'], ...(saved ? [['attendance-theme', saved]] : [])]);
    const events = new Map(), mediaEvents = new Map();
    const media = { matches: dark, addEventListener: (key, fn) => mediaEvents.set(key, fn), removeEventListener: key => mediaEvents.delete(key) };
    const host = {
        localStorage: { getItem: key => { if (blocked) throw Error('Unavailable'); return storage.get(key); }, setItem: (key, value) => { if (blocked) throw Error('Unavailable'); storage.set(key, value); } },
        document: { documentElement: { dataset: {}, style: {} } }, matchMedia: () => media,
        addEventListener: (key, fn) => events.set(key, fn), removeEventListener: key => events.delete(key)
    };
    vm.runInNewContext(source, { window: host });
    return { store: host.attendanceTheme, root: host.document.documentElement, storage, events, mediaEvents, media };
}
test('initial paint follows system by default in both colour schemes', () => {
    for (const dark of [true, false]) {
        const b = browser({ dark });
        assert.equal(b.store.getSnapshot().preference, 'system');
        assert.equal(b.root.dataset.theme, dark ? 'dark' : 'light');
        assert.equal(b.root.style.colorScheme, b.root.dataset.theme);
    }
});
test('saved explicit preference overrides system and survives a fresh load', () => {
    const b = browser({ saved: 'light', dark: true });
    assert.equal(b.root.dataset.theme, 'light');
    b.store.setPreference('dark');
    assert.equal(browser({ saved: b.storage.get('attendance-theme') }).root.dataset.theme, 'dark');
    assert.equal(b.storage.get('token'), 'unchanged');
    assert.equal(b.storage.size, 2); // No resolved-theme or authentication writes.
});
test('system changes are reactive; explicit preferences remain selected', () => {
    const b = browser(); const stop = b.store.start();
    b.media.matches = true; b.mediaEvents.get('change')();
    assert.equal(b.root.dataset.theme, 'dark');
    b.store.setPreference('light'); b.mediaEvents.get('change')();
    assert.equal(b.root.dataset.theme, 'light');
    b.store.setPreference('system');
    assert.equal(b.root.dataset.theme, 'dark');
    stop();
});
test('blocked storage supports session-only theme without throwing', () => {
    const b = browser({ blocked: true, dark: true });
    assert.equal(b.root.dataset.theme, 'dark');
    b.store.setPreference('light');
    assert.equal(b.root.dataset.theme, 'light');
});
test('invalid saved and submitted values are safe', () => {
    const b = browser({ saved: 'invalid' });
    b.store.setPreference('admin');
    assert.equal(b.store.getSnapshot().preference, 'system');
    assert.equal(b.storage.get('attendance-theme'), 'invalid');
});
test('cross-tab changes and removal sync without touching authentication', () => {
    const b = browser(); const stop = b.store.start();
    b.events.get('storage')({ key: 'token', newValue: 'other' });
    assert.equal(b.store.getSnapshot().preference, 'system');
    b.events.get('storage')({ key: 'attendance-theme', newValue: 'dark' });
    assert.equal(b.root.dataset.theme, 'dark');
    b.events.get('storage')({ key: 'attendance-theme', newValue: null });
    assert.equal(b.store.getSnapshot().preference, 'system');
    assert.equal(b.storage.get('token'), 'unchanged'); stop();
});
test('subscriptions use stable snapshots and clean up across remounts', () => {
    const b = browser(); const initial = b.store.getSnapshot(); let updates = 0;
    const unsubscribe = b.store.subscribe(() => updates++);
    const stop = b.store.start(), secondStop = b.store.start();
    b.store.setPreference('system');
    assert.equal(b.store.getSnapshot(), initial);
    assert.equal(updates, 0);
    b.store.setPreference('dark'); assert.equal(updates, 1);
    unsubscribe(); b.store.setPreference('light'); assert.equal(updates, 1);
    stop(); stop(); assert.equal(b.events.size, 1);
    secondStop(); assert.equal(b.events.size, 0); assert.equal(b.mediaEvents.size, 0);
    const remountStop = b.store.start(); assert.equal(b.events.size, 1); remountStop();
});
