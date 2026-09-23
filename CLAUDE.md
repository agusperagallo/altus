# Vertex — contexto para Claude Code

Vertex es un SaaS de gestión de instructores de ski para Cerro Bayo (Villa La Angostura, Argentina). Lo usa un cliente real que paga. **Estabilidad, seguridad e integridad de datos van antes que cualquier mejora cosmética.** Desarrollador único: Agustín Peragallo. Idioma del proyecto: español rioplatense.

Producción: `vertexski.com.ar` (Vercel). Backend: Supabase, proyecto `pngtxnpywchizyyynuyb`.

## Stack y estructura

- HTML/CSS/JS vanilla, **sin build step, sin `package.json`, sin ES6 modules**. Alpine.js vía CDN (`defer` en el `<head>`), adopción incremental.
- `js/` contiene todos los scripts: `vertex_panel.js` (panel supervisor, ~4.000 líneas), `vertex_instructor.js`, `vertex_reporte.js`, `vertex_audit.js`, `vertex_offline.js`. Cada uno tiene un índice de secciones arriba.
- Páginas: `vertex_panel.html`, `vertex_instructor.html`, `vertex_login.html`, `vertex_activar.html`, `vertex_resena.html`.
- CSS: `global.css` (variables `:root` y componentes compartidos) + un `.css` por página. **No unificar `.modal`/`.modal-head`/`.modal-body`**: el de instructor es un bottom-sheet mobile-first a propósito.
- `api/` son funciones serverless de Vercel sin dependencias (solo `fetch`): `send-whatsapp.js`, `estado-pistas.js`.
- PWA: `sw.js` (caché `vertex-v3`), `manifest.json`. **No reestructurar carpetas a `src/public`** — rompería la PWA ya instalada.
- Supabase: RLS en las 21 tablas; helpers `mi_rol()` (lee el JWT) y `mi_instructor_id()` (lee `usuarios.instructor_id`, devuelve NULL si el instructor está inactivo — es el punto único de control). Multi-tenancy preparado (`cerros`, `cerro_id` en todas las tablas) pero **inerte a propósito**: ninguna política filtra por `cerro_id` todavía.

## Reglas duras (aprendidas a golpes)

- **Alpine `:style`: siempre objeto, nunca string.** Un string reemplaza todo el style estático. `{opacity: cond ? '.5' : '1'}` sí; `'opacity:.5'` no. `:class` con objeto es seguro.
- **Alpine `x-effect`: leer todas las variables reactivas antes de cualquier `return` temprano**, si no Alpine no las registra como dependencias. Y llamar la función explícitamente al abrir como respaldo.
- **Convivencia Alpine ↔ vanilla:** el código viejo que lee el DOM (`querySelectorAll('.active')`) no necesita cambios. El que lee una variable global sí: el setter de Alpine escribe también esa variable (`this.x = val; xGlobal = val`). `Alpine.$data(el)` sirve como puente desde funciones externas.
- **XSS:** nunca interpolar texto de usuario en `innerHTML` sin `escapeHtml()`. En `onclick` pasar solo el `id` (UUID) y buscar el nombre adentro de la función, nunca el nombre como string.
- **`sbAuthAux`** (cliente Supabase aparte con `persistSession:false`) para crear cuentas — el cliente principal pisa la sesión del supervisor.
- **`vertex_activar.html` usa `fetch()` crudo a la REST API**, no el SDK — el Service Worker rompe el SDK en esa página.
- **`configuracion` es una sola fila**: actualizar con `.not('id','is',null)`.
- Modales: `setPage()` cierra cualquier `.modal-overlay.open` al cambiar de sección — no quitar eso, evita modales fantasma que tapan el scroll.
- `input[type=radio]`, `checkbox` y `date` necesitan `appearance:auto` explícito (el reset global usa `appearance:none`).
- PDF: `window.open()` + `document.write()` + `print()`. `html2pdf` solo para elementos ya presentes en la página.
- Escuelita queda dispersa en 4 bloques dentro de `vertex_panel.js` a propósito (referencias cruzadas); marcada con 🎿 en el índice.

## Cómo verificar antes de dar algo por hecho

- `node -c js/archivo.js` para sintaxis; balance de llaves en CSS.
- Probar en navegador headless (Playwright) **con los archivos reales**, simulando el flujo del usuario. Para cambios visuales, sacar captura. Para seguridad, simular el ataque.
- Para RLS: `begin; set local role authenticated; set local request.jwt.claims = '{...}'; ...; rollback;` con datos reales sin persistir nada. Un `USING` que falla filtra en silencio; un `WITH CHECK` que falla tira error.
- Al terminar una tanda: listar todos los archivos tocados y qué probar, en orden de importancia.

## Pendientes por prioridad

**Alta**
- Upgrade de Supabase a Pro (backups): decisión de Agustín, no de código.
- Política RLS de `tokens_presencia` (hoy abierta a cualquier autenticado; la tabla no se usa aún).

**Media**
- Push notifications: faltan clase asignada, cancelación/cambio, recordatorio de presencia 16:30.
- QR de presencia diaria (tabla `tokens_presencia` ya existe; falta toda la lógica).
- Validación de rangos horarios coherentes en formularios.
- Seguir migrando a Alpine, una sección por vez. Hecho: modal **Editar instructor** (`editarInstructorForm()`: toggles Escuela/Escuelita con `.vtx-switch` + `mei-idiomas`). Próximo candidato: a definir.

**En pausa por decisión de Agustín**
- Activar multi-tenancy (`mi_cerro_id()`, filtros RLS, sacar el hardcodeo de "Cerro Bayo", generalizar `api/estado-pistas.js`).
- Integración con Snowmatch (siempre detrás de una API propia en Vercel, nunca acceso directo a Supabase).
- Landing de Vertex como producto.

## Principios

- Costo de mantenimiento como restricción principal: es un dev solo.
- Primero lo de bajo riesgo y alta señal; parquear lo que arriesga producción por algo cosmético.
- No confiar en auditorías externas sin verificar contra el código real: las que citan `altus_rol` o `sb.auth.admin` están mirando algo viejo o inventado.
- "Si existe y querés ajustarlo, incluido. Si no existe y querés que lo haga, se cotiza."
