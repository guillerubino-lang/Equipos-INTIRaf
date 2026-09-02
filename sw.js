// Service worker mínimo: solo habilita "Agregar a pantalla de inicio".
// No cachea datos (los equipos siempre se leen en vivo desde Sheets/Drive).
const CACHE_NAME = "equipos-shell-v41";
const SHELL = ["./index.html", "./styles.css", "./app.js", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Nunca interceptar llamadas a la API de Google: siempre en vivo.
  if (url.hostname.includes("googleapis.com") || url.hostname.includes("google.com")) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
