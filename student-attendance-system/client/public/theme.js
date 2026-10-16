/* Runs before styles/application to use the correct theme on the first paint. */
(function (host) {
  'use strict';
  var key = 'attendance-theme';
  var valid = function (value) { return ['light', 'dark', 'system'].includes(value); };
  var read = function () {
    try { var value = host.localStorage.getItem(key); return valid(value) ? value : 'system'; }
    catch (_) { return 'system'; }
  };
  var media;
  try { media = host.matchMedia('(prefers-color-scheme: dark)'); } catch (_) {}
  var preference = read();
  var snapshot;
  var listeners = new Set();
  var users = 0;
  function apply() {
    var resolved = preference === 'system' ? (media && media.matches ? 'dark' : 'light') : preference;
    if (snapshot && snapshot.preference === preference && snapshot.resolved === resolved) return;
    snapshot = Object.freeze({ preference: preference, resolved: resolved });
    host.document.documentElement.dataset.theme = resolved;
    host.document.documentElement.style.colorScheme = resolved;
    listeners.forEach(function (listener) { listener(); });
  }
  function systemChanged() { if (preference === 'system') apply(); }
  function storageChanged(event) {
    if (event.key !== key && event.key !== null) return;
    preference = valid(event.newValue) ? event.newValue : 'system';
    apply();
  }
  apply();
  host.attendanceTheme = {
    getSnapshot: function () { return snapshot; },
    subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
    setPreference: function (value) {
      if (!valid(value)) return;
      preference = value;
      try { host.localStorage.setItem(key, value); } catch (_) { /* Session-only preference. */ }
      apply();
    },
    start: function () {
      if (users++ === 0) {
        host.addEventListener('storage', storageChanged);
        if (media && media.addEventListener) media.addEventListener('change', systemChanged);
        else if (media && media.addListener) media.addListener(systemChanged);
        apply();
      }
      var stopped = false;
      return function () {
        if (stopped) return;
        stopped = true;
        if (--users === 0) {
          host.removeEventListener('storage', storageChanged);
          if (media && media.removeEventListener) media.removeEventListener('change', systemChanged);
          else if (media && media.removeListener) media.removeListener(systemChanged);
        }
      };
    }
  };
})(window);
