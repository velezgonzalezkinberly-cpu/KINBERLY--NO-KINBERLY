# PWA de reconocimiento de imágenes · CBTIS 260

Aplicación web progresiva (PWA) que clasifica imágenes con un modelo entrenado en
**Google Teachable Machine**, ejecutado en el navegador con **TensorFlow.js**.
Usa solo HTML, CSS y JavaScript (sin frameworks).

## 1. Estructura del proyecto

```
PWA-KIMBERLY/
├── index.html              Página 1: inicio y problemática
├── pruebas.html            Página 2: solución y pruebas del modelo
├── manifest.json           Configuración de la PWA
├── service-worker.js       Caché y funcionamiento sin conexión
├── README.md               Este archivo
├── PRUEBAS.md              Procedimiento y tablas de pruebas
├── .nojekyll               Evita el procesamiento Jekyll de GitHub Pages
├── css/
│   └── estilos.css
├── js/
│   ├── app.js              Lógica de la aplicación (aquí está MODEL_URL)
│   └── lib/                TensorFlow.js 1.3.1 y Teachable Machine Image 0.8.5 (copias locales)
├── modelo/                 Modelo exportado de Teachable Machine
│   ├── model.json
│   ├── metadata.json
│   └── weights.bin
├── fuentes/                Barlow Condensed y Source Sans 3 (licencia SIL OFL)
└── imagenes/
    ├── logo-cbtis260.png
    ├── icono-instagram.png
    └── iconos-pwa/         Iconos de la PWA (192, 512, maskable, apple-touch, favicon)
```

Las bibliotecas, las fuentes y el modelo están **dentro del proyecto**, sin CDN. Por eso la
aplicación completa, incluida la clasificación, funciona sin conexión después de la primera visita.

## 2. Importante: el modelo actual tiene 2 clases, no 3

El `metadata.json` del modelo incluido contiene solo estas clases:

```
"labels": ["kinberly", "no_kinberly"]
```

El proyecto pide tres (Kimberly, No es Kimberly, Otra persona). **La aplicación no inventa la tercera:**
muestra las clases que traiga el modelo (hoy 2) y lo indica en el apartado «Estado del modelo».
En cuanto exportes un modelo con 3 clases y reemplaces los 3 archivos de `modelo/`, aparecerán las tres
sin cambiar código.

Además, con solo 2 clases el modelo está obligado a repartir el 100 % entre ellas: **cualquier imagen**
(un objeto, un paisaje, una persona distinta) terminará clasificada como una de las dos, a veces con
porcentajes altos. Esa es otra razón para entrenar la tercera clase.

### Cómo organizar las tres clases en Teachable Machine

| Clase | Nombre sugerido | Qué fotos incluir |
|---|---|---|
| 1 | `Kimberly` | Muchas fotos de Kimberly: distintos ángulos, luz, fondos, con y sin accesorios. |
| 2 | `No es Kimberly` | Imágenes **sin personas**: objetos, salones, paisajes, paredes, mesas. |
| 3 | `Otra persona` | Fotos de **otras personas**, con variedad de rostros y condiciones. |

Las clases 2 y 3 **no deben representar lo mismo**. Si ambas contienen personas, el modelo no podrá
distinguirlas. Consejos: 50 a 100 imágenes o más por clase, cantidades parecidas entre clases, y fotos
de prueba **distintas** a las usadas para entrenar. Publica fotos de otras personas únicamente con su permiso.

Los nombres se reconocen sin importar mayúsculas ni acentos (`Kimberly`, `no_kimberly`, `Otra persona`,
etc.). Si usas un nombre distinto, se mostrará tal cual lo escribiste.

## 3. Configurar la URL del modelo

La constante está al inicio de `js/app.js`:

```js
const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/kRgX1nPFs/';  // modelo en línea
const MODEL_URL_RESPALDO = './modelo/';   // se usa solo si el enlace falla (y la app avisa)
```

Orden de carga: primero `MODEL_URL`; si falla, `MODEL_URL_RESPALDO`; si también falla, se muestra el error
con el botón «Reintentar la carga». Para usar solo el modelo del proyecto: `MODEL_URL = './modelo/'` y
`MODEL_URL_RESPALDO = ''`.

**Opción A: modelo dentro del proyecto (funciona sin conexión).**
1. En Teachable Machine: **Exportar modelo → Tensorflow.js → Descargar → Descargar mi modelo**.
2. Descomprime el ZIP (contiene `model.json`, `metadata.json` y `weights.bin`).
3. Copia los 3 archivos a la carpeta `modelo/`, reemplazando los actuales.
4. Pon `MODEL_URL = './modelo/'`.
5. Sube el valor de `CACHE_VERSION` en `service-worker.js` (ver sección 6).

**Opción B (activa ahora): modelo alojado por Teachable Machine (requiere Internet).**
1. **Exportar modelo → Tensorflow.js → Subir mi modelo** y copia el enlace para compartir.
2. Pégalo en `js/app.js`, con la barra final:
   `const MODEL_URL = 'https://teachablemachine.withgoogle.com/models/XXXXXXXXX/';`

Con la opción B la clasificación necesita Internet; sin ella se usa el respaldo local (si existe).
Las clases que verás son las del modelo del enlace, que puede no coincidir con el de `modelo/`.

## 4. Probar en localhost

La cámara y el service worker requieren **HTTPS o localhost**; abrir los archivos con doble clic (`file://`) no sirve.

```bash
cd PWA-KIMBERLY
python3 -m http.server 8080
```

Abre `http://localhost:8080/`. (Alternativa con Node.js: `npx serve .`)

## 5. Verificar manifiesto y service worker

En Chrome o Edge: `F12 → pestaña Application`.
- **Manifest**: debe mostrar nombre, iconos y sin errores; el botón de instalación debe estar disponible.
- **Service Workers**: estado *activated and is running*.
- **Cache Storage**: una caché `pwa-kimberly-v2` con ~23 archivos.
- **Prueba sin conexión**: en Service Workers marca *Offline* (o apaga Wi-Fi) y recarga; la app debe abrir y clasificar.

### Propiedades del `manifest.json`

| Propiedad | Para qué sirve |
|---|---|
| `name` / `short_name` | Nombre completo y nombre bajo el icono (máx. ~12 caracteres). |
| `description` | Descripción de la aplicación. |
| `lang`, `dir` | Idioma (`es`) y dirección del texto. |
| `start_url` | Página que abre la app instalada. Relativa (`./index.html`) para funcionar en subrutas. |
| `scope` | Rutas que pertenecen a la app (`./` = toda la carpeta). |
| `display` | `standalone`: se abre como app, sin barra del navegador. |
| `orientation` | `any`: permite vertical y horizontal. |
| `theme_color` | Color de la barra de estado/título (rojo del plantel). |
| `background_color` | Color de la pantalla de arranque. |
| `icons` | Iconos 192 y 512 px; los `maskable` se adaptan a las formas de Android. |

### Cómo funciona el service worker

Está documentado dentro de `service-worker.js`. En resumen: al instalarse guarda todos los archivos en una
caché versionada; al activarse borra cachés antiguas; en cada petición usa **primero caché, luego red**;
si no hay ninguna de las dos, responde con un mensaje 503 (o con la página de inicio si es una navegación).

## 6. Publicar cambios: sube `CACHE_VERSION`

Como los archivos se sirven desde caché, **cada vez que modifiques algo** cambia en `service-worker.js`:

```js
const CACHE_VERSION = 'v2';   // v1 → v2 → v3 ...
```

Si no lo haces, quien ya visitó la app seguirá viendo la versión anterior.

## 7. Subir a GitHub y activar GitHub Pages

1. Crea una cuenta en https://github.com y un repositorio **público** (por ejemplo `pwa-kimberly`).
2. Sube los archivos **desde dentro de la carpeta del proyecto**, de modo que `index.html` quede en la raíz del repositorio.
   - Sin comandos: en el repositorio, **Add file → Upload files**, arrastra el *contenido* de la carpeta
     (incluidas las subcarpetas y el archivo `.nojekyll`) y pulsa **Commit changes**.
   - Con Git:
     ```bash
     cd PWA-KIMBERLY
     git init
     git add .
     git commit -m "Primera versión de la PWA"
     git branch -M main
     git remote add origin https://github.com/TU-USUARIO/pwa-kimberly.git
     git push -u origin main
     ```
     (GitHub te pedirá iniciar sesión por el navegador o con un token **tuyo**; nunca lo guardes en el proyecto.)
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   Branch: `main` / carpeta `/ (root)` → Save**.
4. Espera 1–3 minutos. La URL será `https://TU-USUARIO.github.io/pwa-kimberly/`.

Todas las rutas del proyecto son relativas, por lo que funcionan en esa subruta.

**Privacidad:** el repositorio es público. No subas fotos personales ni de otras personas (por eso
las fotos de entrenamiento no se incluyen en este proyecto).

## 8. Instalar en un celular Android

1. Abre la URL de GitHub Pages en **Chrome**.
2. Menú ⋮ → **Instalar aplicación** (o **Añadir a la pantalla de inicio**).
3. Abre el icono nuevo: debe iniciar sin barra del navegador.
4. Prueba sin conexión: activa el modo avión y abre la app; la interfaz y la clasificación deben funcionar.

## 9. Comprobar una actualización

1. Modifica algo visible (por ejemplo un texto) y sube `CACHE_VERSION` a `v2` en `service-worker.js`.
2. Sube los cambios a GitHub y espera a que Pages publique.
3. En el celular o la computadora donde ya está instalada la app, ábrela con conexión.
4. Debe aparecer la barra **«Hay una nueva versión de la aplicación disponible»**. Pulsa **Actualizar ahora**.
5. La página se recarga con el cambio. En DevTools → Cache Storage solo debe quedar `pwa-kimberly-v2`.

## 10. Notas de honestidad técnica

- Las clasificaciones son estimaciones; la app no identifica personas con certeza.
- Los iconos PWA se generaron ampliando el logo original (148 × 148 px), por lo que se ven algo suaves.
  Si consigues el logo en mayor resolución, reemplaza los archivos de `imagenes/iconos-pwa/`.
- El icono de correo es un sobre genérico; el de Instagram es el archivo que proporcionaste.
- El engranaje de la portada es un dibujo propio, no el logotipo oficial.
- Si abres la app en un navegador sin WebGL, TensorFlow.js usa CPU (funciona, pero más lento).

## Créditos y licencias

TensorFlow.js y Teachable Machine Image (Apache 2.0, Google). Fuentes Barlow Condensed y Source Sans 3
(SIL OFL; licencias en `fuentes/`).
