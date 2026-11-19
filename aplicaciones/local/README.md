# Fractal Local

Aplicación de escritorio con **egui/eframe**. La física (`fractal-fisica`) corre
**in-process**: no hace falta Axum, Vue ni pegamento web.

## Qué incluye

- Escenarios desde `datos/escenarios/*.json`:
  - **Tres cuerpos (caos)** / **Figure-8** y órbitas periódicas
  - **Tierra-Luna**, **Sistema Solar**
  - **LEO · Hohmann**, **Formación**, **Tierra–Luna L2** (misión)
- Vista **2D** (defecto) y **3D** (pozo Φ + texturas reales)
- Panel **Misión** (estilo GMAT-lite): burns VNB, Hohmann, targeting de
  apoapsis, capas Newton/J₂, integrador Verlet/RK4, ground track, eclipse
- Sandbox: masa y **vx/vy/vz** en vivo
- Cámara: zoom, pan / órbita 3D, presets cenital/oblicua/perfil
- Atajos: `Espacio`, `G`, `R`, `F`, `2`/`3` (vista)

## Requisitos

- Rust **1.85+** (el workspace usa `edition = "2024"`)
- Display gráfico (X11/Wayland) para ejecutar; `cargo build` basta para compilar
- En Linux: `libxkbcommon-x11` (p. ej. `sudo apt install libxkbcommon-x11-0`)

## Compilar y ejecutar

Desde la raíz del repo:

```bash
cargo build -p fractal-local
cargo run -p fractal-local
```

Los JSON se resuelven desde `datos/escenarios/` (ruta relativa al crate o al cwd).
Si falta un fichero, figure-8 y caos embebidos siguen disponibles.

## Texturas 3D

Si existen PNG/JPEG en `aplicaciones/web/public/texturas/` (p. ej. `tierra.png`,
`luna.png`, `sol.png`), el modo 3D las usa. Si no, se generan discos sombreado
procedurales por planeta.

## Dirección (local primero)

1. **Ahora:** simulación local 2D/3D + sandbox + malla adaptativa.
2. **Después:** más herramientas de misión (manibras, reportes).
3. **Más adelante (estilo GMAT):** la web puede llegar como vista secundaria.
