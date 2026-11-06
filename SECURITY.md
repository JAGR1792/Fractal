# Política de seguridad

- Reportar vulnerabilidades de forma privada al mantenedor.
- No incluir secretos en el repositorio.
- Ejecutar `cargo audit` y `npm audit` antes de cada release.
- API en desarrollo es abierta; producción requiere JWT + RBAC.
