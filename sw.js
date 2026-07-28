/* Scan BL — service worker
 *
 * Deux objectifs :
 *  1. Démarrer sans réseau (entrepôt, sous-sol, parking).
 *  2. Rendre les mises à jour explicites. Historiquement, la seule façon de
 *     savoir si une nouvelle version était appliquée était de lire le numéro
 *     de version en bas d'écran, et la seule façon de forcer la mise à jour
 *     était d'effacer les données de site puis de réinstaller l'icône.
 *     Désormais l'app annonce elle-même « une mise à jour est prête ».
 *
 * IMPORTANT : incrémenter CACHE_VERSION à chaque publication, sinon les
 * appareils déjà installés continueront de servir l'ancien index.html.
 */
const CACHE_VERSION = 'scanbl-v15';

// Uniquement des ressources locales : tout est déjà embarqué dans index.html
// (ZXing compris), il n'y a aucun CDN à mettre en cache.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icone.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // Ne jamais bloquer l'installation sur l'échec d'une ressource annexe :
      // une app non installable serait pire qu'une app partiellement en cache.
      .catch((err) => console.warn('[sw] pré-cache partiel :', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(
        noms.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// La page demande la bascule immédiate quand l'utilisateur appuie sur « Installer ».
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne s'occupe que des GET de même origine : ni les requêtes de la caméra,
  // ni un éventuel appel externe ne doivent transiter par ce cache.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // Navigation (ouverture de l'app) : le cache d'abord, pour un démarrage
  // instantané et fiable même sans réseau. La mise à jour éventuelle est
  // détectée par le navigateur sur sw.js, et signalée dans l'interface.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((hit) => hit || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Ne met en cache que les réponses complètes et valides
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copie = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copie));
        return res;
      });
    })
  );
});
