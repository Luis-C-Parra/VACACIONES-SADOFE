# Planificación de Vacaciones · Enfermería · SADOFE

Web app estática para planificar vacaciones del personal de enfermería en ciclos **octubre → julio**.

## Incluye

- Calendario de octubre a julio del año siguiente.
- Asignación por período (desde/hasta).
- Vacaciones compartidas: no bloquea superposiciones.
- Click sobre una celda para agregar/quitar un día.
- Sábados y domingos diferenciados.
- Feriados configurables con color independiente.
- Reportes mensual, semanal, anual y por enfermero.
- Exportación a Excel con estructura de calendario similar al modelo enviado.
- Exportación a PDF, un mes por página.
- Personal editable.
- Persistencia local en el navegador.
- Integración opcional con Google Sheets mediante `Code.gs`.

## Fuente de enfermeros

El backend opcional toma los nombres desde la pestaña **enfermeros** del Google Spreadsheet **SADOFE**, columna A.

## Publicar en GitHub Pages

1. Subir `index.html` a un repositorio.
2. Activar GitHub Pages.
3. Abrir la URL publicada.

No necesita servidor para funcionar localmente.

## Conectar Google Sheets

1. Abrir el Spreadsheet SADOFE.
2. Extensiones → Apps Script.
3. Copiar el contenido de `Code.gs`.
4. Guardar.
5. Implementar → Nueva implementación → Aplicación web.
6. Ejecutar como usted y habilitar acceso según las políticas de su cuenta.
7. Copiar la URL `/exec`.
8. En la pestaña **Enfermeros** de la app, pegar la URL.
9. Usar **Cargar desde Google Sheets** y luego **Guardar en Google Sheets**.

## Próxima etapa recomendada

Para producción conviene agregar:
- usuarios/roles (administrador y consulta),
- historial de cambios,
- respaldo automático,
- reglas configurables de cantidad de días,
- bloqueo de fechas ya cerradas,
- filtro por sector/piso/turno,
- panel de cobertura de personal,
- exportación exactamente idéntica al libro institucional.
