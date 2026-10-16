/* 오프라인에서도 열리도록 앱 파일을 보관합니다.
   늘 인터넷의 최신 파일을 먼저 받고(브라우저 임시 저장도 건너뜀), 연결이 없을 때만 보관본을 씁니다. */
var CACHE = 'bookclub-1do-2026.10.02-5';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'content/index.json', 'icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; /* 나눔판 서버와 글꼴은 건드리지 않음 */
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
    })
  );
});
