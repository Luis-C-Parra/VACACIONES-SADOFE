# Planificación de Vacaciones · Enfermería

App para planificar vacaciones del personal de enfermería, con los datos guardados en un Google Sheet (personal, vacaciones, feriados y configuración).

## Archivos

- `index.html` — estructura de la app
- `styles.css` — estilos
- `app.js` — lógica del frontend (calendario, asignaciones, reportes, exportación a Excel/PDF)
- `Code.gs` — backend en Google Apps Script, se pega en el editor de Apps Script del Google Sheet

## Instalación

1. Creá un Google Sheet nuevo (o usá uno existente).
2. Andá a **Extensiones → Apps Script** y pegá todo el contenido de `Code.gs`, reemplazando el código de ejemplo.
3. Guardá, y andá a **Implementar → Nueva implementación**.
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
4. Copiá la URL que termina en `/exec`.
5. En `app.js`, pegá esa URL en la constante `API_URL` (arriba del todo del archivo).
6. Subí `index.html`, `styles.css` y `app.js` a donde vayas a servir la app (GitHub Pages, Netlify, etc.).

## Actualizar el backend después de editar Code.gs

Editar el código en el editor de Apps Script **no actualiza automáticamente** la URL `/exec` ya publicada. Cada vez que cambies `Code.gs`:

1. Implementar → Administrar implementaciones
2. Editá (ícono de lápiz) la implementación existente — no crees una nueva
3. Versión → **Nueva versión** → Implementar

Así la URL `/exec` se mantiene igual y no hace falta tocar `app.js` de nuevo.
