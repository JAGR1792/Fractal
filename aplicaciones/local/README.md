# Fractal Local (AppEscritorio)

Aplicación de escritorio con **egui/eframe**. La física (`fractal-fisica`) corre
**in-process**: no hace falta Axum, Vue ni pegamento web.

Rama de trabajo: **`AppEscritorio`** (línea de producto escritorio, aparte del
track web).

## Qué incluye

- Escenarios desde `datos/escenarios/*.json`:
  - **Sistema Solar** (arranque por defecto — texturas reales)
  - **LEO · Hohmann**, **Formación**, **Tierra–Luna L2**
  - Tres cuerpos / órbitas periódicas / Tierra–Luna
- Vista **2D** y **3D** (pozo gravitatorio Φ + discos texturizados)
- **Texturas reales** en [`texturas/`](texturas/) (JPL/Celestia vía GMAT);
  el cargador rechaza placeholders viejos
- Panel **Misión**: burns VNB, Hohmann, targeting, Newton/J₂, Verlet/RK4,
  ground track, eclipse
- Sandbox: masa y velocidades en vivo
- Cámara: zoom, pan / órbita 3D, presets cenital / oblicua / perfil

## Texturas (importante)

Los PNG antiguos del repo eran **placeholders procedurales** (blob azul/verde,
rayas). Ya no se usan.

Fuente canónica:

```text
aplicaciones/local/texturas/*.jpg   ← 1024×512, mapas reales
```

Comprobación automática:

```bash
cargo test -p fractal-local texturas -- --nocapture
# genera texturas/_preview_tierra_esfera.png (gitignored) para inspección visual
```

En la UI, el HUD muestra `texturas N/M` en verde solo si cargó mapas reales.

## Requisitos

- Rust **1.85+** (`edition = "2024"`)
- Display gráfico (X11/Wayland)
- Linux: `libxkbcommon-x11` (p. ej. paquete del distro)

## Compilar y ejecutar

Desde la raíz del repo:

```bash
cargo run -p fractal-local
```

Los JSON se resuelven desde `datos/escenarios/`. Las texturas desde
`aplicaciones/local/texturas/` (vía `CARGO_MANIFEST_DIR`).

## Atajos

`Espacio` pausa · `G` pozo · `R` reiniciar · `2`/`3` vista · `[` `]` escenario ·
`F` cámara · `P` presentación · `O` orbitar

## Dirección

1. Escritorio usable: simulación + misión + texturas reales.
2. Más herramientas de misión (manibras, reportes).
3. Web como vista secundaria (otra rama / track).
