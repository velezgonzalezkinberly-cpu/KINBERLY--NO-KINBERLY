/* =========================================================================
   service-worker.js — PWA de reconocimiento de imágenes · CBTIS 260

   Un service worker es un script que el navegador ejecuta en segundo plano,
   entre la página y la red. Aquí se usa para guardar los archivos de la
   aplicación en el dispositivo y poder abrirla sin conexión.

   CÓMO FUNCIONA (resumen)
   ───────────────────────
   1. INSTALACIÓN  (evento "install")
      Se descargan y guardan en una caché con nombre y versión todos los
      archivos de la aplicación: páginas, estilos, scripts, bibliotecas,
      fuentes, imágenes y el modelo de Teachable Machine.

   2. ACTIVACIÓN  (evento "activate")
      Se borran las cachés de versiones anteriores y el service worker toma
      el control de las páginas abiertas.

   3. PETICIONES  (evento "fetch")
      Estrategia «primero caché»: si el archivo está guardado se entrega de
      inmediato (rápido y sin conexión). Si no está, se pide a la red y se
      guarda una copia. Si no hay red ni copia, se responde con un mensaje
      de error controlado (o con la página de inicio, si es una navegación).

   4. ACTUALIZACIONES  (mensaje "SKIP_WAITING")
      Una versión nueva no reemplaza a la anterior hasta que la persona pulsa
      «Actualizar ahora» (ver js/app.js). Así los archivos nunca se mezclan
      de dos versiones distintas mientras la aplicación está en uso.

   ¡IMPORTANTE AL PUBLICAR CAMBIOS!
   ────────────────────────────────
   Como los archivos se sirven desde la caché, cada vez que modifiques
   cualquier archivo del proyecto debes CAMBIAR la constante CACHE_VERSION
   (por ejemplo de 'v1' a 'v2'). Si no la cambias, los dispositivos que ya
   visitaron la aplicación seguirán viendo los archivos antiguos.

   RUTAS
   ─────
   Todas las rutas son relativas a ESTE archivo (que está en la raíz del
   proyecto), por lo que funcionan igual en localhost y en una subruta de
   GitHub Pages como https://usuario.github.io/nombre-del-repositorio/
   ========================================================================= */
'use strict';

/* Cambia este valor en cada publicación (v1 → v2 → v3 …). */
const CACHE_VERSION = 'v3';

const PREFIJO_CACHE = 'pwa-kimberly-';
const CACHE_ACTUAL = PREFIJO_CACHE + CACHE_VERSION;

/*
  Recursos ESENCIALES: si alguno no se puede descargar, la instalación falla
  y se reintenta más tarde (así nunca queda instalada una aplicación incompleta).
*/
const RECURSOS_ESENCIALES = [
  './',
  './index.html',
  './pruebas.html',
  './manifest.json',
  './css/estilos.css',
  './js/app.js',
  './js/lib/tf.min.js',
  './js/lib/teachablemachine-image.min.js',
  './fuentes/barlow-condensed-latin-600-normal.woff2',
  './fuentes/barlow-condensed-latin-700-normal.woff2',
  './fuentes/source-sans-3-latin-400-normal.woff2',
  './fuentes/source-sans-3-latin-600-normal.woff2',
  './imagenes/logo-cbtis260.png',
  './imagenes/icono-instagram.png',
  './imagenes/iconos-pwa/icon-192.png',
  './imagenes/iconos-pwa/icon-512.png',
  './imagenes/iconos-pwa/icon-maskable-192.png',
  './imagenes/iconos-pwa/icon-maskable-512.png',
  './imagenes/iconos-pwa/apple-touch-icon.png',
  './imagenes/iconos-pwa/favicon-32.png'
];

/*
  Recursos del MODELO: se guardan «si se puede». Si alguno falla (por ejemplo,
  si usas un MODEL_URL externo y borraste la carpeta modelo/), la instalación
  continúa y solo se muestra una advertencia en la consola.
*/
const RECURSOS_DEL_MODELO = [
  './modelo/model.json',
  './modelo/metadata.json',
  './modelo/weights.bin'
];


/* ---------- 1. INSTALACIÓN ---------- */
self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(CACHE_ACTUAL);

    // { cache: 'reload' } obliga a pedir el archivo a la red y no al caché
    // HTTP del navegador, para no guardar copias viejas.
    await cache.addAll(RECURSOS_ESENCIALES.map((url) => new Request(url, { cache: 'reload' })));

    await Promise.all(RECURSOS_DEL_MODELO.map(async (url) => {
      try {
        const respuesta = await fetch(new Request(url, { cache: 'reload' }));
        if (respuesta.ok) {
          await cache.put(url, respuesta);
        } else {
          console.warn('[SW] No se guardó (estado ' + respuesta.status + '):', url);
        }
      } catch (error) {
        console.warn('[SW] No se pudo guardar el recurso del modelo:', url, error);
      }
    }));

    // No se llama a skipWaiting() aquí: la actualización la confirma la persona.
  })());
});


/* ---------- 2. ACTIVACIÓN Y LIMPIEZA DE CACHÉS ANTIGUAS ---------- */
self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(
      nombres
        .filter((nombre) => nombre.startsWith(PREFIJO_CACHE) && nombre !== CACHE_ACTUAL)
        .map((nombre) => caches.delete(nombre))
    );
    // Toma el control de las páginas ya abiertas (necesario para que la
    // aplicación funcione sin conexión justo después de la primera visita).
    await self.clients.claim();
  })());
});


/* ---------- 3. PETICIONES: PRIMERO CACHÉ, DESPUÉS RED ---------- */
self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;

  // Solo se gestionan lecturas (GET) del mismo origen. Todo lo demás
  // (otros sitios, formularios, etc.) lo resuelve el navegador normalmente.
  if (peticion.method !== 'GET') return;
  if (new URL(peticion.url).origin !== self.location.origin) return;

  evento.respondWith(responder(peticion));
});

async function responder(peticion) {
  const cache = await caches.open(CACHE_ACTUAL);

  // a) ¿Está guardado? Se entrega directamente.
  //    ignoreSearch: "index.html?x=1" se trata igual que "index.html".
  const guardada = await cache.match(peticion, { ignoreSearch: true });
  if (guardada) return guardada;

  // b) No está guardado: se pide a la red y se conserva una copia.
  try {
    const respuesta = await fetch(peticion);
    if (respuesta.status === 200 && respuesta.type === 'basic') {
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    // c) Sin red y sin copia: respuesta de respaldo controlada.
    if (peticion.mode === 'navigate') {
      const inicio = await cache.match('./index.html');
      if (inicio) return inicio;
    }
    return new Response(
      'Recurso no disponible sin conexión.',
      {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  }
}


/* ---------- 4. ACTUALIZACIÓN CONFIRMADA POR LA PERSONA ---------- */
self.addEventListener('message', (evento) => {
  if (evento.data && evento.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
