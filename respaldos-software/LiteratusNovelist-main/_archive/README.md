# _archive/

Artefactos de un solo uso, ya cumplidos. **No** son estado vivo de los agentes
(los `*_CHECKPOINT.json`, `*_LOG.md`, `TASKS.md`, `AGENT_LOG.md` activos siguen en
la raíz del proyecto). Nada de aquí lo lee ningún flujo actual; se puede borrar
cuando quieras.

| Carpeta | Contenido |
|---|---|
| `logs/` | Logs de corridas de importación/portadas ya terminadas (`dryrun.log`, `full_library_*.log`, `import_real.log`, `inventory_run.log`, `pilot_import.log`). |
| `import-batches/` | Listas de slugs de los lotes de importación 001–007 + `all_pending_unique_slugs.txt`, `pilot_slugs.txt`, `first_pending_slug.txt`. Imports completados. |
| `scripts/` | Scripts one-off del piloto inicial: `library_inventory.py`, `pilot_importer.py`, `pilot_25_selection.json`. El importador vigente es `manage.py import_books`. |
| `codex-run-logs/` | Antiguo `.codex-run-logs/` (stdout/stderr de arranques de backend/frontend). |

Borrado en esta limpieza (regenerable, no archivado):
`chapter_audit_backup.json` (~275 MB, se regenera con `manage.py audit_book_chapters`)
y `__pycache__/`.
