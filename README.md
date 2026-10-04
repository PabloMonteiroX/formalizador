# Formalizador de enunciados

PWA para formalizar frases y razonamientos en **lógica de enunciados** (UOC, módulo *Lógica de enunciados*). Está pensada para usarse en el iPhone desde Safari, instalada en la pantalla de inicio, y funciona sin conexión.

Autor: **Pablo Monteiro** · [@PabloMonteiroX](https://github.com/PabloMonteiroX)

## Qué hace

| Área | Función |
|---|---|
| Escritura | Barra de conectivas encima del teclado de iOS (¬ ∧ ∨ → ( ) , ∴ P Q R S ⌫) y atajos ASCII (`!` `&` `\|` `>` `->` `:`) |
| Sintaxis | Comprueba la fórmula mientras escribes y marca el error con `^` en su posición |
| Estructura | Conectiva principal, paréntesis mínimos y completos, árbol de subfórmulas, profundidad |
| Tabla de verdad | Una columna por subfórmula; clasifica en tautología, antinomia o contingente |
| Razonamientos | `P → Q, P ∴ Q`: válido, no válido (con contraejemplo) o premisas inconsistentes |
| Formas normales | Pasos (eliminar →, De Morgan), FNC y FND simplificadas y lista de cláusulas |
| Resolución | Cláusulas de las premisas más la conclusión negada (conjunto de apoyo) |
| Comparar | Equivalencia entre dos fórmulas con la fila donde difieren |
| Átomos | Avisos: átomo sin definir, palabras de conectiva en el significado, infinitivos |
| Datos | Guardado automático, deshacer al borrar, búsqueda, exportar e importar copia JSON |

Convenciones del módulo: `¬` > `∧` = `∨` > `→`, asociatividad por la izquierda y `∨` no exclusiva.

## FARAD-8, tutor retro (plugin)

FARAD-8 es un robot de 8 bits con estética Game Boy que vive en la esquina de la app. De vez en cuando parpadea, pierde píxeles o suelta un `MOV AX, LOGICA`: no es un fallo, es su personalidad.

- **Proactivo:** mientras escribes, compara tu frase con tu fórmula y avisa en una burbuja de los errores típicos: «ni» mal negado, o exclusiva que falta o que sobra, «…, cuando X» al final, «…, y …», `→` sin ninguna condición en la frase, dirección de la condición necesaria, tautologías sospechosas y errores de sintaxis explicados.
- **PISTA:** escalera de dos niveles, primero la zona y después el concepto. **Nunca escribe la formalización por ti**, por integridad académica.
- **LEER:** traduce tu fórmula al castellano usando tus átomos, para que la compares con la frase.
- **QUIZ:** tres preguntas generadas a partir de tu fórmula (conectiva principal, valor en una fila, qué dice). Con 3 de 3 la tarjeta queda marcada ★ COMPRENDIDO; si cambias la fórmula, hay que volver a demostrarlo.
- **¿POR QUÉ?:** explica el error, el contraejemplo con tus átomos o la conectiva principal.

**Con y sin conexión:**

| Situación | Qué hace |
|---|---|
| Sin endpoint configurado | Modo cartucho: todo en el dispositivo (`brain.js`) |
| Endpoint configurado y con señal | ⚡ ONLINE: preguntas libres a un modelo de IA a través de tu worker |
| El servidor falla o tarda más de 12 s | Se escapa a modo cartucho, responde en local y lo reintenta en 60 s |
| El iPhone pierde la red | Avisa («jaula de Faraday») y sigue en local; al volver la red, avisa de que ha vuelto |

**Cerebro online (opcional).** La API key **nunca** va en la app: vive como secreto en un Cloudflare Worker (`server/farad8-worker.js`). El worker solo acepta peticiones de `pablomonteirox.github.io`, limita las peticiones, recorta el texto de entrada y lleva la regla de integridad en su prompt de sistema.

```bash
npm i -g wrangler && wrangler login
wrangler init farad8 --yes            # sustituye src/index.js por server/farad8-worker.js
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy                       # https://farad8.<usuario>.workers.dev
```

Después, en la app: FARAD-8 → **AJUSTES** → pega la URL → **PROBAR** → **GUARDAR**. La CSP solo permite conexiones a `*.workers.dev`; si usas otro dominio, añádelo a `connect-src` en `index.html`.

**Plugins.** `js/plugins/registry.js` es el anfitrión. La app emite los eventos `open`, `analyze` y `close`, y cada plugin recibe un `host` con: almacenamiento con espacio de nombres propio, `toast`, el motor lógico y entradas en el menú. Si un plugin falla, la app sigue funcionando. Los plugins se activan y desactivan en Menú → Plugins. Para añadir otro, crea su carpeta y regístralo en `PLUGINS`.

## Estructura

```
index.html              página (CSP estricta, metadatos iOS)
styles.css              estilos (fuentes del sistema, modo claro y oscuro, áreas seguras)
js/logic.js             motor lógico puro, sin DOM: parser, tablas, validez, FNC/FND
js/store.js             persistencia local y copia de seguridad
js/app.js               interfaz: lista, editor, barra de teclado, menú, PWA
sw.js                   service worker (offline y aviso de actualización)
manifest.webmanifest    manifest de la PWA
icons/                  apple-touch-icon 180, 192, 512, maskable, svg, favicon
js/plugins/registry.js  anfitrión de plugins (eventos, almacenamiento, menú)
js/plugins/farad8/      FARAD-8: farad8.js (interfaz), brain.js (cerebro local), sprite.js, farad8.css
server/farad8-worker.js cerebro online (Cloudflare Worker con la API key como secreto)
tests/*.test.mjs        tests del motor y de FARAD-8 (node --test)
tests/e2e*.mjs          pruebas en navegador con viewport de iPhone (Playwright, opcional)
```

No tiene dependencias ni paso de compilación: es HTML, CSS y JS (módulos ES) servidos tal cual.

## Probar en local (Fedora)

```bash
cd formalizador
python3 -m http.server 8765        # abre http://localhost:8765
npm test                           # tests del motor (Node 18 o superior)
```

Los módulos ES y el service worker **no funcionan abriendo `index.html` con doble clic** (`file://`). Hace falta un servidor, aunque sea el de Python.

## Publicar en GitHub Pages

```bash
cd formalizador
git init -b main
git add .
git commit -m "Formalizador 1.0.0"
git remote add origin git@github.com:PabloMonteiroX/formalizador.git
git push -u origin main
```

En GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**. En uno o dos minutos queda en:

`https://pablomonteirox.github.io/formalizador/`

El fichero `.nojekyll` evita que GitHub procese el sitio con Jekyll. Todas las rutas son relativas (`./`), así que funciona dentro de la subcarpeta `/formalizador/`.

## Instalar en el iPhone

1. Abre la URL en **Safari**.
2. Pulsa **Compartir** y después **Añadir a pantalla de inicio**.
3. Ábrela desde el icono: se ve a pantalla completa y funciona sin conexión.

## Publicar una versión nueva

1. Cambia `VERSION` en `sw.js` y `APP_VERSION` en `js/app.js` (por ejemplo, `1.1.1`). Si añades ficheros, inclúyelos también en la lista `ASSETS` de `sw.js`.
2. `git commit` y `git push`.
3. Al abrir la app, aparece «Hay una versión nueva → Actualizar».

Si no subes `VERSION`, los iPhone que ya la tengan instalada seguirán usando los ficheros de la caché.

## Memoria y datos

- **Dónde se guardan:** en `localStorage`, con la clave `formalizador:v1`. Una tarjeta ocupa alrededor de 1 KB; el límite habitual es de unos 5 MB, así que caben miles. En el menú, *Datos y versión* muestra el espacio usado.
- **Mismo origen que Nutriapp:** `pablomonteirox.github.io/formalizador/` y `/nutriapp/` comparten origen y, por tanto, `localStorage`. Por eso todas las claves llevan el prefijo `formalizador:`, y el service worker solo borra cachés que empiezan por `formalizador-`. Las dos apps no se pisan.
- **Safari y la app instalada no comparten datos:** en iOS, la app añadida a la pantalla de inicio tiene un almacenamiento separado del de Safari. Lo que escribas en Safari no aparece en la app instalada.
- **Borrado por parte del sistema:** iOS puede borrar los datos de webs que no se usan durante semanas. La app pide almacenamiento persistente (`navigator.storage.persist()`), pero iOS no lo garantiza. **Exporta una copia de seguridad de vez en cuando** (Menú → Exportar): en el iPhone se abre la hoja de compartir y puedes guardarla en Archivos o en iCloud Drive.
- **Importar** añade las tarjetas a las que ya tienes; no borra nada.

## Compatibilidad

| Plataforma | Estado |
|---|---|
| iOS / iPadOS 15.4 o superior (Safari y app instalada) | Completa |
| iOS 15.0 a 15.3 | Funciona, pero el menú no se abre (`<dialog>` llegó en la 15.4) |
| Chrome, Edge y Firefox de escritorio; Android | Completa |

Detalles para iOS que ya están resueltos:

- Barra de estado translúcida y márgenes con `safe-area-inset` (notch y Dynamic Island).
- Campos con letra de 16 px, para que Safari no haga zoom al tocarlos.
- La barra de conectivas se coloca encima del teclado con la API `visualViewport`.
- Al pulsar un botón de la barra, el campo no pierde el foco, así que el teclado no se cierra.
- Sin autocorrección, sin mayúsculas automáticas en los átomos y sin detección de teléfonos.
- `color-mix`, `dvh` y `backdrop-filter` tienen alternativa para versiones antiguas.

## Seguridad y privacidad

- CSP estricta: solo carga recursos del propio origen y no hay scripts en línea. Las conexiones externas se limitan a `*.workers.dev` (el cerebro online opcional).
- Sin analítica y sin cookies. Por defecto todo ocurre en el dispositivo; solo si configuras el cerebro online se envía la tarjeta abierta a **tu** worker.
- Todo el texto del usuario se escapa antes de mostrarlo.
- Las copias que se importan se validan y se limpian campo a campo.

## Accesibilidad

Botones de 44 × 44 px como mínimo, foco visible, pestañas que se recorren con las flechas, regiones `aria-live` para los avisos, enlace para saltar al contenido, modo oscuro automático y respeto a `prefers-reduced-motion`.

## Límites

- Tabla de verdad y validez: hasta 12 átomos (4096 filas). La tabla se dibuja con 6 átomos o menos.
- Formas normales: hasta 256 cláusulas.
- Átomos: una letra mayúscula (A–Z).

## Licencia

MIT © 2026 Pablo Monteiro
