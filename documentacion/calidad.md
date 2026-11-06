# Calidad, Seguridad y Operación — Fractal

Guía de calidad para el equipo. Complementa `plan_paralelismo_distribuido.md`.

## 1. SLO / SLA medibles

| Métrica | SLO | Medición |
|---|---|---|
| Disponibilidad API | ≥ 99.5% mensual | Uptime checks |
| Latencia `POST /simulaciones` p95 | ≤ 200 ms | Prometheus |
| Latencia `GET /estados` p95 | ≤ 100 ms | Prometheus |
| Tasa de error 5xx | ≤ 0.5% | Logs |
| Tiempo de simulación (Sistema Solar, 100 pasos) | ≤ 50 ms | Bench |
| Cobertura código nuevo | ≥ 80% | cargo-llvm-cov / vitest |

Usar percentiles (p95, p99), nunca promedios, en pruebas de carga.

## 2. Threat modeling (OWASP Top 10)

- **Inyección:** validación estricta en `PeticionSimulacion::validar()`; sin SQL (almacenamiento en memoria). Consultas parametrizadas si se agrega DB.
- **Autenticación/Autorización:** hoy API abierta (dev). Producción requiere JWT + RBAC; datos sensibles nunca en logs.
- **Datos de tarjetas / PCI-DSS:** no aplica (sin pagos). Si se agregan pagos, usar tokenización externa (Stripe) y nunca almacenar PAN.
- **XSS/CSRF:** frontend sin `innerHTML` con datos de usuario; CORS restrictivo en prod.
- **Exposición de datos:** logs enmascarados (sin masas/posiciones completas en prod).
- **Componentes vulnerables:** `cargo audit` + `npm audit` en CI.
- **Logging y monitoreo:** auditoría de acceso a sesiones.

## 3. Codificación segura

- Validación de entrada en frontera (API).
- Sin `unwrap()` en handlers.
- Transacciones atómicas cuando se agregue persistencia.
- Logs enmascarados: no imprimir cuerpos completos ni tokens.
- Límites: `MAX_CUERPOS`, `MAX_PASOS`, `MAX_SESIONES`.

## 4. Revisión de código (checklist obligatorio)

- [ ] Seguridad: validación, sin secretos, sin `unwrap`.
- [ ] Mantenibilidad: nombres claros, funciones ≤ 40 líneas.
- [ ] Anidamiento ≤ 3 niveles.
- [ ] Complejidad ciclomática ≤ 10.
- [ ] Pruebas unitarias/integración para código nuevo.
- [ ] Cobertura ≥ 80% en código nuevo.
- [ ] Sin warnings de clippy.

## 5. Quality Gates (bloquean PR y despliegue)

- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo test --workspace --all-features`
- Cobertura ≥ 80% en código nuevo
- `npm run tipo`, `npm test`, `npm run lint`
- `cargo audit` con 0 vulnerabilidades críticas/altas
- OWASP ZAP baseline: 0 alertas críticas/altas

## 6. Pruebas de carga

- Herramienta: k6 (script en `pruebas/carga/k6.js`).
- Métricas: p95, p99, error rate, throughput.
- Escenario: 50 VUs por 2 min contra `/api/v1/fuerzas/distribuida`.

## 7. Observabilidad

- Endpoint `/metrics` (Prometheus).
- Logs estructurados con `tracing`.
- Alertas sugeridas: memoria > 80%, latencia p95 > SLO, error rate > 1%.

## 8. Auditoría de IA (si se usan modelos)

- Documentar sesgo, explicabilidad, robustez, drift.
- Validar falsos positivos/negativos en datos de prueba.
- Reentrenamiento periódico y monitoreo de drift.

## 9. UAT y postmortems

- Validación con usuarios reales (estudiantes/profesor).
- Postmortems sin culpa para fallas externas; ajustar Cost of Non-Quality (CoNQ).

## 10. SAST/DAST

- SAST: SonarQube (o `cargo clippy` + `cargo audit` como mínimo).
- DAST: OWASP ZAP baseline contra API en CI.
