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
tests/logic.test.mjs    tests del motor (node --test)
tests/e2e.mjs           prueba en navegador con viewport de iPhone (Playwright, opcional)
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

1. Cambia `VERSION` en `sw.js` y `APP_VERSION` en `js/app.js` (por ejemplo, `1.0.1`).
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

- CSP estricta: solo carga recursos del propio origen y no hay scripts en línea.
- Sin servicios de terceros, sin analítica, sin cookies y sin servidor: todo ocurre en el dispositivo.
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
