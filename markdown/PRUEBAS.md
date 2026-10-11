# Procedimiento de pruebas

Abre la aplicación en `http://localhost:8080/pruebas.html` (o en tu URL de GitHub Pages) y espera a que
el estado del modelo diga **«Modelo listo para usar»**.

## A. Pruebas de clasificación

Para cada prueba: **Cargar imagen del dispositivo → Analizar imagen**. Comprueba que se muestran el
resultado principal, **todas** las clases con su porcentaje y que no aparece ningún error.

| # | Prueba | Imagen a usar | Clase esperada | Clase obtenida | % | ¿Muestra todas las clases sin errores? |
|---|---|---|---|---|---|---|
| 1 | Imagen de Kimberly | Foto de Kimberly **no usada en el entrenamiento** | Kimberly | | | |
| 2 | Imagen que no es de Kimberly | Imagen de la 2.ª clase (ver README, sección 2) | No es Kimberly | | | |
| 3 | Fotografía de otra persona | Foto de otra persona (con su permiso) | Otra persona* | | | |

\* La clase «Otra persona» solo existe si el modelo tiene 3 clases. El modelo incluido actualmente tiene 2.

## B. Pruebas de errores

| # | Prueba | Cómo hacerla | Resultado esperado | ¿Cumple? |
|---|---|---|---|---|
| 4 | Sin imagen | Abrir la página y pulsar «Analizar imagen» | Aviso «Primero selecciona una imagen»; no hay resultados | |
| 5 | URL del modelo incorrecta | Cambiar `MODEL_URL` en `js/app.js` por `'./modelo-x/'` y recargar | Estado «No se pudo cargar el modelo», mensaje con la URL y botón «Reintentar la carga»; el resto de la app sigue usable | |
| 6 | Cámara sin permiso | Pulsar «Tomar fotografía» y **bloquear** el permiso | Mensaje «Permiso de cámara denegado»; «Cargar imagen» sigue funcionando | |
| 7 | Archivo que no es imagen | Elegir un `.txt` o `.pdf` | Mensaje «El archivo no es una imagen» | |
| 8 | Cámara en HTTP no seguro | Abrir por `http://` con una IP (no localhost) | Mensaje «La cámara requiere una conexión segura» | |

## C. Pruebas de PWA

| # | Prueba | Resultado esperado | ¿Cumple? |
|---|---|---|---|
| 9 | DevTools → Application → Manifest | Sin errores; iconos visibles | |
| 10 | Service Workers | *activated and is running* | |
| 11 | Modo sin conexión | Con Wi-Fi apagado, la app abre, navega y clasifica | |
| 12 | Instalar en Android | Se instala y abre sin barra del navegador | |
| 13 | Actualización (README, sección 9) | Aparece el aviso, se actualiza y queda solo la caché nueva | |
| 14 | Diseño | Sin desplazamiento horizontal en celular, tableta y escritorio | |

---

## Pruebas ya ejecutadas durante el desarrollo

Ejecutadas con **Chromium automatizado (Playwright)** sobre la interfaz real y el modelo real incluido.
No sustituyen las pruebas manuales en tu celular.

### Clasificación con las fotos del ZIP

⚠️ **Estas son las fotos de tu carpeta de trabajo, probablemente las mismas del entrenamiento.** Aun así hubo un error, y los resultados
**no miden qué tan bien reconoce fotos nuevas.** (Modelo probado: `tm-my-image-model.zip` exportado el 2026-10-11, 2 clases.) Para evaluar el modelo usa fotos que no estén en el entrenamiento.

| Grupo | Fotos | Clase obtenida | Porcentajes de la clase principal |
|---|---|---|---|
| `kinberly` | 5 | Kimberly (5 de 5) | 100.0 % en las 5 |
| `no kinberly` | 5 | No es Kimberly (4 de 5) | 100.0 % en 4 fotos. **La foto «12.52.13 PM (2)» se clasificó como Kimberly con 96.0 %** (error del modelo) |

En todas se mostraron las dos clases del modelo con sus porcentajes y no se hicieron peticiones de red
durante la predicción.

### Otras comprobaciones

| Comprobación | Resultado |
|---|---|
| Sin imagen seleccionada | Aviso correcto, sin resultados |
| URL del modelo incorrecta (carpeta inexistente) | Mensaje claro, botón de reintento, la app sigue funcionando |
| Fallo de red al descargar el modelo | Mensaje claro; el reintento funciona al restablecerse |
| Archivo `.txt` y JPG dañado | Mensajes claros, sin imagen cargada |
| Cámara (cámara simulada de Chromium): abrir, cambiar, capturar, analizar, cerrar | Funciona; la cámara se apaga |
| Errores de cámara `NotAllowedError`, `NotFoundError`, `NotReadableError` | **Simulados** con la misma excepción que lanzan los navegadores; mensajes correctos. El bloqueo real del permiso debe probarse en tu dispositivo |
| Cámara en HTTP no seguro | Mensaje correcto |
| Service worker en subruta `/nombre-del-repositorio/` | Alcance correcto; 23 archivos en caché |
| Sin conexión real (servidor apagado) | Inicio, navegación, modelo y predicción funcionan; recurso faltante → 503; página no guardada → inicio |
| Actualización v1 → v2 | Aviso visible, al confirmar queda solo la caché v2 y el CSS nuevo; v2 funciona sin conexión |
| Manifiesto (Chrome DevTools Protocol) | Sin errores ni problemas de instalabilidad; iconos con el tamaño declarado |
| Desbordamiento horizontal a 360, 390, 768 y 1280 px | Ninguno |
| Referencias a archivos y enlaces del pie | Sin rutas rotas; Instagram y correo apuntan a las URLs indicadas |

## Pendiente de comprobar manualmente

- Instalación y uso en un celular Android real, incluido el permiso real de cámara.
- Clasificación con fotos nuevas (no usadas en el entrenamiento).
- Publicación en GitHub Pages y que los enlaces de Instagram y correo abran correctamente.
- Aspecto en Safari/iPhone (no se probó).
