# Fractal

Simulador orbital (escritorio + web).

## Características

- **Física newtoniana** con Velocity Verlet / RK4, capas Newton+J₂, burns y Hohmann
- **App de escritorio** (`aplicaciones/local`, rama **`AppEscritorio`**) — egui, texturas reales, panel misión
- **Visualización web** con doble renderizador: ULTRA (WebGPU) y LITE (WebGL2)
- **Código y documentación en español**
- **Tests científicos** que validan la física contra soluciones analíticas

## Arranque rápido (escritorio)

```bash
git checkout AppEscritorio
cargo run -p fractal-local
```

Detalle: [`aplicaciones/local/README.md`](aplicaciones/local/README.md). Texturas reales en
`aplicaciones/local/texturas/` (no uses los PNG placeholder antiguos).

## Estructura del proyecto

```
Fractal/
├── codigo/
│   ├── fisica/          ← Motor gravitacional (+ fuerzas, maniobras, orbital)
│   └── renderizado/     ← Interpolación / culling (WASM para ULTRA)
├── aplicaciones/
│   ├── local/           ← App escritorio egui (rama AppEscritorio)
│   │   └── texturas/    ← Mapas planetarios reales (JPEG)
│   └── web/             ← Frontend Vue 3 + TypeScript + Vite
├── datos/escenarios/    ← Escenarios JSON
├── documentacion/       ← ADRs y docs científicos
├── CONTRIBUTING.md
├── clippy.toml
└── rustfmt.toml
```



## Cómo contribuir

Lee [CONTRIBUTING.md](CONTRIBUTING.md) para entender cómo está organizado el proyecto y qué estándares de código aplicamos.

## Licencia

MIT — ver [LICENSE](LICENSE).
