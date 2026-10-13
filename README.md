# Fractal

Simulador orbital 3D educativo — explora el Sistema Solar, modifica las condiciones físicas y estudia las consecuencias mediante simulaciones calculadas en servidor.

## Características

- **Física newtoniana** con Velocity Verlet (conservación de energía a largo plazo)
- **Visualización 3D** con doble renderizador: ULTRA (WebGPU nativo + WASM/wgpu, máximo rendimiento) y LITE (WebGL2 mínimo, compatibilidad escolar)
- **API asíncrona** con Axum + Tokio (simulaciones en background)
- **Frontend** TypeScript puro + Vite (sin framework de escena)
- **Código y documentación en español**
- **Tests científicos** que validan la física contra soluciones analíticas

## Estructura del proyecto

```
Fractal/
├── codigo/
│   ├── fisica/          ← Motor gravitacional (biblioteca pura, sin dependencias)
│   │   └── tests/       ← Tests científicos + benches/ (criterion)
│   ├── renderizado/     ← Interpolación y culling en Rust (compila a WASM para ULTRA)
│   └── api/             ← Servidor Axum (Etapa 3)
│       └── tests/       ← Tests de integración del API
├── aplicaciones/
│   └── web/             ← Frontend TypeScript + Vite (sin framework de escena)
│       ├── src/ultra/   ← Renderer WebGPU nativo + WGSL + WASM (máximo rendimiento)
│       ├── src/lite/    ← Renderer WebGL2 mínimo (compatibilidad escolar)
│       └── public/      ← Texturas NASA y copia servible de los escenarios
├── datos/
│   └── escenarios/      ← Escenarios JSON de referencia (fuente de verdad)
├── documentacion/
│   ├── cientifico/      ← Física, integración, validación
│   ├── arquitectura/    ← ADRs, decisiones de diseño, renderizador
│   ├── comportamientos_mejorables.md ← Lo que se ve mal, con causa y arreglo
│   └── pasos_siguientes.md           ← Mapa vivo del proyecto
├── CONTRIBUTING.md      ← Guía de contribución
├── clippy.toml          ← Configuración del linter
└── rustfmt.toml         ← Configuración del formateador
```

Cada crate y el frontend llevan sus tests al lado: no hay carpeta `tests/` en la
raíz del repositorio.

## Cómo ejecutar

```bash
# Rust: física, renderizado y API (workspace raíz)
cargo test --workspace --all-features
cargo run -p fractal-api          # API en http://localhost:3000 (GET /salud)

# Web: frontend ULTRA/LITE
cd aplicaciones/web
npm install
npm run dev                       # Vite en http://localhost:5173
npm test                          # vitest
npm run build                     # tsc + bundle de producción
```

En el navegador, `?perfil=ultra` fuerza WebGPU y `?perfil=lite` fuerza WebGL2
(ver `documentacion/arquitectura/renderizador.md`).

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
- [x] Sandbox con parámetros en vivo (debounce 700 ms, sin botón Lanzar)
- [x] Sesiones vivas con cursor: sin tramos, sin reinicios (ADR-0007)
- [ ] Persistencia y compartir por link o id de sesión
- [ ] Suavizado ε recomendado por defecto y `dt` adaptativo

**Mejorable (siempre al día):** ver
[`documentacion/comportamientos_mejorables.md`](documentacion/comportamientos_mejorables.md)
y [`documentacion/pasos_siguientes.md`](documentacion/pasos_siguientes.md).

## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para entender cómo está organizado el proyecto y qué estándares de código aplicamos.

## Licencia

MIT — ver [LICENSE](LICENSE).
