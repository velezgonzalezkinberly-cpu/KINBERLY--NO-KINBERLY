/* =========================================================================
   app.js — PWA de reconocimiento de imágenes · CBTIS 260

   Este archivo se carga en las dos páginas (index.html y pruebas.html).
     • En ambas: registra el service worker y avisa si hay una versión nueva.
     • Solo en pruebas.html: carga el modelo de Teachable Machine, gestiona
       la imagen (archivo o cámara), ejecuta la predicción y muestra resultados.

   Índice:
     1. Configuración  ← AQUÍ SE CAMBIA LA URL DEL MODELO (MODEL_URL)
     2. Utilidades
     3. Service worker y actualizaciones
     4. Mensajes en pantalla
     5. Modelo de Teachable Machine
     6. Imagen seleccionada y vista previa
     7. Cámara
     8. Predicción y resultados
     9. Inicio
   ========================================================================= */
'use strict';


/* =========================================================================
   1. CONFIGURACIÓN
   ========================================================================= */

/*
  MODEL_URL — dirección de la CARPETA donde está el modelo exportado.
  Debe contener model.json, metadata.json y weights.bin.

  Opción A: modelo guardado dentro del proyecto.
      const MODEL_URL = './modelo/';
    Funciona en localhost y en GitHub Pages (ruta relativa) y permite usar
    el modelo sin conexión una vez que el service worker lo guardó.

  Opción B (la que está activa): modelo alojado por Teachable Machine (requiere Internet).
      const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/XXXXXXXXX/';
    Se obtiene en Teachable Machine: Exportar modelo → Tensorflow.js →
    Subir mi modelo → copiar el «Enlace para compartir».
    (Más detalles en el README.md.)
*/
const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/kRgX1nPFs/';

/*
  MODEL_URL_RESPALDO — modelo guardado dentro del proyecto. Se usa SOLO si
  MODEL_URL no se puede cargar (sin Internet, enlace caído, etc.) y la app
  avisa cuando esto ocurre. Para desactivar el respaldo: const MODEL_URL_RESPALDO = '';
*/
const MODEL_URL_RESPALDO = './modelo/';

/* Si la clase con mayor porcentaje queda por debajo de este valor (0 a 1),
   se muestra un aviso de confianza baja. */
const UMBRAL_CONFIANZA = 0.7;

/* Número de clases que contempla el proyecto. Si el modelo cargado tiene un
   número distinto, se muestra una nota informativa (no impide usarlo). */
const CLASES_ESPERADAS = 3;

/* Tamaño máximo permitido para imágenes cargadas desde el dispositivo. */
const TAMANO_MAXIMO_MB = 15;

/* Ruta del service worker, relativa a la página (funciona en subrutas). */
const RUTA_SERVICE_WORKER = './service-worker.js';

/*
  Nombres que se muestran al usuario. La clave es el nombre de la clase del
  modelo ya normalizado (minúsculas, sin acentos, espacios → guion bajo).
  Si una clase no aparece aquí, se muestra tal cual la escribió Teachable Machine.
*/
const NOMBRES_CLASES = {
  kimberly: 'Kimberly',
  kinberly: 'Kimberly',
  no_kimberly: 'No es Kimberly',
  no_kinberly: 'No es Kimberly',
  no_es_kimberly: 'No es Kimberly',
  otra_persona: 'Otra persona',
  otra: 'Otra persona'
};

/* Estado de la aplicación (solo se usa en pruebas.html). */
const estado = {
  modelo: null,           // modelo de Teachable Machine ya cargado
  promesaModelo: null,    // carga en curso (evita cargarlo dos veces)
  imagenLista: false,     // ¿hay una imagen cargada y decodificada?
  urlObjeto: null,        // URL temporal de la imagen (se libera al cambiarla)
  flujoCamara: null,      // MediaStream de la cámara
  camaraFrontal: true,    // true = cámara frontal, false = trasera
  analizando: false       // evita ejecutar dos predicciones a la vez
};


/* =========================================================================
   2. UTILIDADES
   ========================================================================= */

const $ = (id) => document.getElementById(id);

/** "No_Kinberly " → "no_kinberly" (sin acentos, minúsculas, guiones bajos). */
function normalizarEtiqueta(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function nombreVisible(etiqueta) {
  return NOMBRES_CLASES[normalizarEtiqueta(etiqueta)] || String(etiqueta);
}

/** 0.8734 → "87.3 %" */
function formatoPorcentaje(probabilidad) {
  const valor = (probabilidad * 100).toLocaleString('es-MX', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
  return valor + ' %';
}

function formatoTamano(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** URL absoluta de la carpeta del modelo, con "/" final. */
function urlBaseModelo(url = MODEL_URL) {
  const base = url.endsWith('/') ? url : url + '/';
  return new URL(base, window.location.href).href;
}


/* =========================================================================
   3. SERVICE WORKER Y ACTUALIZACIONES
   ========================================================================= */

/*
  Flujo de actualización:
    1. Se publica una versión nueva (cambia CACHE_VERSION en service-worker.js).
    2. El navegador detecta el cambio e instala el nuevo service worker, que
       queda «en espera» para no cambiar archivos mientras la app está en uso.
    3. Aquí se muestra el aviso «Hay una nueva versión disponible».
    4. Al pulsar «Actualizar ahora» se le ordena al nuevo service worker que
       se active (mensaje SKIP_WAITING) y la página se recarga.
*/
function iniciarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let actualizacionSolicitada = false;

  // Solo se recarga si la persona pidió actualizar (así no se recarga
  // la página en la primera instalación).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (actualizacionSolicitada) window.location.reload();
  });

  function ofrecerActualizacion(trabajador) {
    const aviso = $('aviso-actualizacion');
    const boton = $('boton-actualizar');
    if (!aviso || !boton) return;
    aviso.hidden = false;
    boton.onclick = () => {
      actualizacionSolicitada = true;
      boton.disabled = true;
      trabajador.postMessage({ type: 'SKIP_WAITING' });
    };
  }

  window.addEventListener('load', async () => {
    try {
      const registro = await navigator.serviceWorker.register(RUTA_SERVICE_WORKER);

      // Caso: la versión nueva ya estaba esperando al abrir la página.
      if (registro.waiting && navigator.serviceWorker.controller) {
        ofrecerActualizacion(registro.waiting);
      }

      // Caso: se encuentra una versión nueva mientras la página está abierta.
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing;
        if (!nuevo) return;
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
            ofrecerActualizacion(nuevo);
          }
        });
      });
    } catch (error) {
      // Ocurre, por ejemplo, al abrir el archivo con file:// o sin HTTPS.
      console.warn('No se pudo registrar el service worker:', error);
    }
  });
}


/* =========================================================================
   4. MENSAJES EN PANTALLA
   tipo: 'error' | 'aviso' | 'info' | 'ok'
   ========================================================================= */

function mostrarMensaje(tipo, titulo, detalle) {
  const contenedor = $('mensajes');
  if (!contenedor) return;

  const caja = document.createElement('div');
  caja.className = 'mensaje mensaje--' + tipo;
  caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');

  const encabezado = document.createElement('strong');
  encabezado.textContent = titulo;
  caja.appendChild(encabezado);

  if (detalle) {
    const parrafo = document.createElement('p');
    parrafo.textContent = detalle;
    caja.appendChild(parrafo);
  }

  contenedor.appendChild(caja);
  caja.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function limpiarMensajes() {
  const contenedor = $('mensajes');
  if (contenedor) contenedor.replaceChildren();
}


/* =========================================================================
   5. MODELO DE TEACHABLE MACHINE
   ========================================================================= */

function pintarEstadoModelo(valor, texto) {
  $('estado-modelo').dataset.estado = valor;     // cargando | listo | error
  $('texto-estado-modelo').textContent = texto;
  $('boton-reintentar-modelo').hidden = valor !== 'error';
}

function describirCausa(error) {
  const texto = String((error && error.message) || error);
  if (/404|not found/i.test(texto)) return 'no se encontraron los archivos';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(texto)) return 'sin conexión o bloqueado';
  return texto;
}

/** Explica con palabras claras por qué falló la carga del modelo. */
function describirErrorModelo(error) {
  const url = urlBaseModelo();
  const texto = String((error && error.message) || error);

  if (error && error.codigo === 'BIBLIOTECAS') {
    return 'No se cargaron TensorFlow.js o Teachable Machine Image. Revisa que existan los archivos ' +
           'js/lib/tf.min.js y js/lib/teachablemachine-image.min.js y recarga la página.';
  }
  if (/404|not found/i.test(texto)) {
    return 'No se encontraron los archivos del modelo en: ' + url + ' — Revisa la constante MODEL_URL ' +
           'en js/app.js y que la carpeta contenga model.json, metadata.json y weights.bin.';
  }
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(texto)) {
    return 'No se pudo descargar el modelo desde: ' + url + ' — Comprueba tu conexión a Internet o que ' +
           'la dirección de MODEL_URL sea correcta. Sin conexión solo funciona si el modelo ya se guardó ' +
           'en una visita anterior.';
  }
  return 'Ocurrió un problema al cargar el modelo desde ' + url + ' (' + texto + ').';
}

/** Muestra las clases que trae el modelo cargado y avisa si no son las esperadas. */
function mostrarClasesDelModelo(modelo) {
  const etiquetas = modelo.getClassLabels();
  const nombres = etiquetas.map(nombreVisible);

  const clases = $('clases-modelo');
  clases.textContent = 'Clases del modelo (' + etiquetas.length + '): ' + nombres.join(', ') + '.';
  clases.hidden = false;

  const nota = $('nota-clases');
  if (etiquetas.length !== CLASES_ESPERADAS) {
    nota.textContent =
      'El proyecto contempla ' + CLASES_ESPERADAS + ' clases (Kimberly, No es Kimberly y Otra persona), ' +
      'pero el modelo cargado tiene ' + etiquetas.length + '. La aplicación mostrará las clases que tenga ' +
      'el modelo. Consulta el README para entrenarlo con las tres clases.';
    nota.hidden = false;
  } else {
    nota.hidden = true;
  }
}

/**
 * Carga el modelo (una sola vez) y devuelve una promesa.
 * Pasos: 1) descarga model.json + weights.bin, 2) descarga metadata.json
 * (nombres de clases), 3) deja el modelo listo para predecir.
 */
function cargarModelo() {
  if (estado.modelo) return Promise.resolve(estado.modelo);
  if (estado.promesaModelo) return estado.promesaModelo;

  pintarEstadoModelo('cargando', 'Cargando el modelo…');

  estado.promesaModelo = (async () => {
    if (typeof tf === 'undefined' || typeof tmImage === 'undefined') {
      const fallo = new Error('Bibliotecas no disponibles');
      fallo.codigo = 'BIBLIOTECAS';
      throw fallo;
    }
    const cargarDesde = (url) => {
      const base = urlBaseModelo(url);
      return tmImage.load(base + 'model.json', base + 'metadata.json');
    };

    let modelo;
    try {
      modelo = await cargarDesde(MODEL_URL);
    } catch (errorPrincipal) {
      if (!MODEL_URL_RESPALDO) throw errorPrincipal;
      console.warn('No se pudo cargar MODEL_URL, se intenta el respaldo:', errorPrincipal);
      try {
        modelo = await cargarDesde(MODEL_URL_RESPALDO);
      } catch (errorRespaldo) {
        throw errorPrincipal;          // se informa del fallo del modelo principal
      }
      mostrarMensaje('aviso', 'Se está usando el modelo guardado en el proyecto',
        'No se pudo cargar el modelo de ' + urlBaseModelo(MODEL_URL) + ' (' + describirCausa(errorPrincipal) + ').');
    }

    estado.modelo = modelo;
    mostrarClasesDelModelo(modelo);
    pintarEstadoModelo('listo', 'Modelo listo para usar.');
    return modelo;
  })().catch((error) => {
    estado.promesaModelo = null;            // permite reintentar
    console.error('Error al cargar el modelo:', error);
    pintarEstadoModelo('error', 'No se pudo cargar el modelo.');
    mostrarMensaje('error', 'No se pudo cargar el modelo', describirErrorModelo(error));
    error.yaNotificado = true;              // evita repetir el mensaje al predecir
    throw error;
  });

  return estado.promesaModelo;
}


/* =========================================================================
   6. IMAGEN SELECCIONADA Y VISTA PREVIA
   ========================================================================= */

function liberarImagenAnterior() {
  if (estado.urlObjeto) {
    URL.revokeObjectURL(estado.urlObjeto);
    estado.urlObjeto = null;
  }
}

function ocultarResultado() {
  $('resultado-contenido').hidden = true;
  $('resultado-vacio').hidden = false;
  $('lista-resultados').replaceChildren();
}

/**
 * Muestra una imagen en la vista previa y espera a que el navegador la decodifique.
 * Si la imagen no se puede leer, rechaza la promesa.
 */
function establecerImagen(url, descripcion) {
  return new Promise((resolve, reject) => {
    const imagen = $('imagen-vista-previa');

    imagen.onload = () => {
      estado.imagenLista = true;
      imagen.hidden = false;
      $('vista-previa-vacia').hidden = true;
      $('vista-previa').classList.add('vista-previa--con-imagen');
      const pie = $('descripcion-imagen');
      pie.textContent = descripcion;
      pie.hidden = false;
      resolve();
    };
    imagen.onerror = () => reject(new Error('Imagen no legible'));

    liberarImagenAnterior();
    estado.urlObjeto = url;
    estado.imagenLista = false;
    imagen.src = url;
  });
}

function quitarImagen() {
  const imagen = $('imagen-vista-previa');
  imagen.onload = null;
  imagen.onerror = null;
  imagen.removeAttribute('src');
  imagen.hidden = true;
  liberarImagenAnterior();
  estado.imagenLista = false;
  $('vista-previa-vacia').hidden = false;
  $('vista-previa').classList.remove('vista-previa--con-imagen');
  $('descripcion-imagen').hidden = true;
  ocultarResultado();
}

async function usarArchivo(archivo) {
  limpiarMensajes();
  ocultarResultado();

  if (!archivo) return;

  if (!archivo.type.startsWith('image/')) {
    quitarImagen();
    mostrarMensaje('error', 'El archivo no es una imagen',
      'Selecciona un archivo de imagen (por ejemplo JPG, PNG o WEBP).');
    return;
  }
  if (archivo.size > TAMANO_MAXIMO_MB * 1024 * 1024) {
    quitarImagen();
    mostrarMensaje('error', 'La imagen es demasiado grande',
      'El archivo pesa ' + formatoTamano(archivo.size) + '. El máximo permitido es ' + TAMANO_MAXIMO_MB + ' MB.');
    return;
  }

  try {
    await establecerImagen(URL.createObjectURL(archivo),
      archivo.name + ' (' + formatoTamano(archivo.size) + ')');
  } catch (error) {
    quitarImagen();
    mostrarMensaje('error', 'No se pudo abrir la imagen',
      'El archivo puede estar dañado o tener un formato que el navegador no admite (por ejemplo HEIC). ' +
      'Prueba con una imagen JPG o PNG.');
  }
}


/* =========================================================================
   7. CÁMARA
   La cámara solo está disponible en HTTPS o en localhost, y el navegador
   siempre pide permiso a la persona antes de activarla.
   ========================================================================= */

function describirErrorCamara(error) {
  const nombre = (error && error.name) || '';
  if (nombre === 'NotAllowedError' || nombre === 'PermissionDeniedError' || nombre === 'SecurityError') {
    return ['Permiso de cámara denegado',
      'No se concedió acceso a la cámara. Para usarla, permite el acceso desde el candado junto a la ' +
      'dirección del sitio (o en la configuración del navegador) y vuelve a pulsar el botón. ' +
      'Mientras tanto puedes usar «Cargar imagen del dispositivo».'];
  }
  if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError' || nombre === 'OverconstrainedError') {
    return ['No se encontró una cámara', 'Este dispositivo no tiene una cámara disponible.'];
  }
  if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
    return ['No se pudo usar la cámara',
      'Otra aplicación podría estar usándola. Ciérrala e inténtalo de nuevo.'];
  }
  return ['No se pudo activar la cámara', 'Detalle técnico: ' + (nombre || String(error))];
}

function detenerCamara() {
  if (estado.flujoCamara) {
    estado.flujoCamara.getTracks().forEach((pista) => pista.stop());
    estado.flujoCamara = null;
  }
  const video = $('video-camara');
  if (video) video.srcObject = null;
}

function cerrarCamara() {
  detenerCamara();
  $('camara').hidden = true;
}

async function abrirCamara() {
  limpiarMensajes();

  if (!window.isSecureContext) {
    mostrarMensaje('error', 'La cámara requiere una conexión segura',
      'Abre la aplicación desde una dirección HTTPS (por ejemplo, GitHub Pages) o desde localhost.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    mostrarMensaje('error', 'Este navegador no permite usar la cámara',
      'Usa «Cargar imagen del dispositivo» o prueba con un navegador actualizado.');
    return;
  }

  try {
    detenerCamara();
    // El navegador mostrará aquí la ventana para pedir permiso.
    const flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: estado.camaraFrontal ? 'user' : 'environment' },
      audio: false
    });
    estado.flujoCamara = flujo;

    const video = $('video-camara');
    video.dataset.espejo = String(estado.camaraFrontal);
    video.srcObject = flujo;
    $('camara').hidden = false;
    await video.play();
  } catch (error) {
    console.warn('Error de cámara:', error);
    cerrarCamara();
    const [titulo, detalle] = describirErrorCamara(error);
    mostrarMensaje('error', titulo, detalle);
  }
}

function cambiarCamara() {
  estado.camaraFrontal = !estado.camaraFrontal;
  abrirCamara();
}

function capturarFotografia() {
  const video = $('video-camara');
  if (!video.videoWidth || !video.videoHeight) {
    mostrarMensaje('aviso', 'La cámara aún no está lista', 'Espera un momento a que se vea la imagen e inténtalo de nuevo.');
    return;
  }

  const lienzo = $('canvas-captura');
  lienzo.width = video.videoWidth;
  lienzo.height = video.videoHeight;
  lienzo.getContext('2d').drawImage(video, 0, 0, lienzo.width, lienzo.height);

  lienzo.toBlob(async (blob) => {
    limpiarMensajes();
    ocultarResultado();
    if (!blob) {
      mostrarMensaje('error', 'No se pudo tomar la fotografía', 'Inténtalo de nuevo.');
      return;
    }
    try {
      await establecerImagen(URL.createObjectURL(blob), 'Fotografía tomada con la cámara');
      cerrarCamara();
    } catch (error) {
      quitarImagen();
      mostrarMensaje('error', 'No se pudo procesar la fotografía', 'Inténtalo de nuevo.');
    }
  }, 'image/jpeg', 0.92);
}


/* =========================================================================
   8. PREDICCIÓN Y RESULTADOS
   ========================================================================= */

function mostrarResultados(predicciones) {
  // La predicción más alta es la clase "ganadora".
  const ganadora = predicciones.reduce((a, b) => (b.probability > a.probability ? b : a));

  $('resultado-principal').textContent = nombreVisible(ganadora.className);
  $('resultado-cifra').textContent = formatoPorcentaje(ganadora.probability);

  const lista = $('lista-resultados');
  lista.replaceChildren();

  predicciones.forEach((p) => {
    const elemento = document.createElement('li');
    elemento.className = 'barras__item' + (p === ganadora ? ' barras__item--principal' : '');

    const fila = document.createElement('div');
    fila.className = 'barras__fila';
    const nombre = document.createElement('span');
    nombre.className = 'barras__nombre';
    nombre.textContent = nombreVisible(p.className);
    const valor = document.createElement('span');
    valor.className = 'barras__valor';
    valor.textContent = formatoPorcentaje(p.probability);
    fila.append(nombre, valor);

    const pista = document.createElement('div');
    pista.className = 'barras__pista';
    pista.setAttribute('aria-hidden', 'true');   // el porcentaje ya está escrito en texto
    const relleno = document.createElement('div');
    relleno.className = 'barras__relleno';
    pista.appendChild(relleno);

    elemento.append(fila, pista);
    lista.appendChild(elemento);

    // Se asigna el ancho en el siguiente cuadro para que la barra se anime.
    requestAnimationFrame(() => {
      relleno.style.width = (p.probability * 100).toFixed(1) + '%';
    });
  });

  $('resultado-vacio').hidden = true;
  $('resultado-contenido').hidden = false;
  $('resultado-contenido').scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  if (ganadora.probability < UMBRAL_CONFIANZA) {
    mostrarMensaje('aviso', 'Confianza baja',
      'La clase más probable no supera el ' + Math.round(UMBRAL_CONFIANZA * 100) + ' %. ' +
      'Prueba con una imagen más nítida, bien iluminada y con el sujeto centrado.');
  }
}

async function ejecutarPrediccion() {
  if (estado.analizando) return;
  limpiarMensajes();
  ocultarResultado();

  // 1) Debe existir una imagen.
  if (!estado.imagenLista) {
    mostrarMensaje('aviso', 'Primero selecciona una imagen',
      'Carga una imagen del dispositivo o toma una fotografía y después pulsa «Analizar imagen».');
    return;
  }

  const boton = $('boton-predecir');
  estado.analizando = true;
  boton.disabled = true;
  boton.textContent = 'Analizando…';

  try {
    // 2) Se espera a que el modelo esté listo (o se intenta cargar de nuevo).
    const modelo = await cargarModelo();

    // 3) Predicción real con el modelo entrenado.
    const predicciones = await modelo.predict($('imagen-vista-previa'));
    if (!Array.isArray(predicciones) || predicciones.length === 0) {
      throw new Error('El modelo no devolvió resultados.');
    }

    // 4) Se muestran todas las clases con su porcentaje.
    mostrarResultados(predicciones);
  } catch (error) {
    console.error('Error al analizar la imagen:', error);
    if (!error.yaNotificado) {
      mostrarMensaje('error', 'No se pudo analizar la imagen',
        'Ocurrió un problema durante el análisis. Inténtalo de nuevo con otra imagen. ' +
        'Detalle técnico: ' + ((error && error.message) || error));
    }
  } finally {
    estado.analizando = false;
    boton.disabled = false;
    boton.textContent = 'Analizar imagen';
  }
}


/* =========================================================================
   9. INICIO
   ========================================================================= */

function iniciarPaginaPruebas() {
  const entradaArchivo = $('entrada-archivo');

  $('boton-elegir').addEventListener('click', () => entradaArchivo.click());
  entradaArchivo.addEventListener('change', () => {
    const archivo = entradaArchivo.files && entradaArchivo.files[0];
    usarArchivo(archivo);
    entradaArchivo.value = '';     // permite volver a elegir el mismo archivo
  });

  $('boton-camara').addEventListener('click', abrirCamara);
  $('boton-capturar').addEventListener('click', capturarFotografia);
  $('boton-cambiar-camara').addEventListener('click', cambiarCamara);
  $('boton-cerrar-camara').addEventListener('click', cerrarCamara);

  $('boton-predecir').addEventListener('click', ejecutarPrediccion);
  $('boton-limpiar').addEventListener('click', () => {
    limpiarMensajes();
    quitarImagen();
  });

  $('boton-reintentar-modelo').addEventListener('click', () => {
    limpiarMensajes();
    cargarModelo().catch(() => { /* el error ya se muestra en pantalla */ });
  });

  // La cámara se apaga al salir de la página.
  window.addEventListener('pagehide', detenerCamara);

  // El modelo se empieza a cargar en cuanto se abre la página.
  cargarModelo().catch(() => { /* el error ya se muestra en pantalla */ });
}

iniciarServiceWorker();
if ($('panel-pruebas')) {
  iniciarPaginaPruebas();
}
