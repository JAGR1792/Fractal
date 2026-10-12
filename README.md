# Fractal

Simulador orbital 3D educativo — explora el Sistema Solar, modifica las condiciones físicas y estudia las consecuencias mediante simulaciones calculadas en servidor.

## Características

- **Física newtoniana** con Velocity Verlet (conservación de energía a largo plazo)
- **Visualización 3D** con doble renderizador: ULTRA (WebGPU nativo + WASM/wgpu, máximo rendimiento) y LITE (WebGL2 mínimo, compatibilidad escolar)
- **API asíncrona** con Axum + Tokio (simulaciones en background)
- **Frontend** con Vue 3 + TypeScript + Vite
- **Código y documentación en español**
- **Tests científicos** que validan la física contra soluciones analíticas

## Estructura del proyecto

```
Fractal/
├── codigo/
│   ├── fisica/          ← Motor gravitacional (biblioteca pura, sin dependencias)
│   ├── renderizado/     ← Interpolación y culling en Rust (compila a WASM para ULTRA)
│   └── api/             ← Servidor Axum (Etapa 3)
├── aplicaciones/
│   └── web/             ← Frontend Vue 3 + TypeScript + Vite
│       ├── ultra/       ← Renderer WebGPU nativo + WGSL + WASM (máximo rendimiento)
│       └── lite/        ← Renderer WebGL2 mínimo (compatibilidad escolar)
├── datos/
│   └── escenarios/      ← Escenarios JSON de referencia
├── documentacion/
│   ├── cientifico/      ← Física, integración, validación
│   ├── arquitectura/    ← ADRs, decisiones de diseño
│   └── educativo/       ← Guías para docentes
├── tests/
│   ├── cientificos/     ← Tests de física (sin servidor ni gráficos)
│   └── integracion/     ← Tests de API + cliente
├── CONTRIBUTING.md      ← Guía de contribución
├── clippy.toml          ← Configuración del linter
└── rustfmt.toml         ← Configuración del formateador
```

## Estado del proyecto

**Etapa 0 — Especificación científica:** completada

- [x] Modelo gravitatorio documentado
- [x] Integrador Velocity Verlet documentado
- [x] Escenarios de referencia creados
- [x] ADRs de arquitectura
- [x] CI/CD con GitHub Actions

**Etapa 1 — Motor físico:** completada

- [x] N-cuerpos con Velocity Verlet + tests científicos
- [x] Suavizado gravitacional ε + conservación verificada

**Etapa 2 — Render ULTRA/LITE:** completada

- [x] WebGPU instanciado + WebGL2 de respaldo, sin motores
- [x] Texturas NASA vendorizadas, rotación propia, picking con seguimiento
- [x] Estelas vivas, estrellas, telemetría orbital en vivo

**Etapa 3 — API + sandbox:** en curso

- [x] Axum + jobs en background, protocolo binario `Float32Array`
- [x] Sandbox con parámetros en vivo, flujo infinito encadenado
- [ ] Persistencia, compartir por link, modo en vivo con debounce
- [ ] Streaming continuo (diseño en `documentacion/plan_continuidad.md`)

**Mejorable (siempre al día):** ver
[`documentacion/comportamientos_mejorables.md`](documentacion/comportamientos_mejorables.md)
y [`documentacion/pasos_siguientes.md`](documentacion/pasos_siguientes.md).

## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para entender cómo está organizado el proyecto y qué estándares de código aplicamos.

## Licencia

MIT — ver [LICENSE](LICENSE).
