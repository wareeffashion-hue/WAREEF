fetch('/api/public/config').then((r) => r.json()).then((c) => {
  document.querySelectorAll('[data-app-name]').forEach((e) => { e.textContent = c.appName; });
}).catch(() => {});
