# Fractal Local

Aplicación de escritorio con **egui/eframe**. La física (`fractal-fisica`) corre
**in-process**: no hace falta Axum, Vue ni pegamento web.

## Qué incluye (MVP)

- Tres cuerpos en coreografía **figure-8** (Chenciner–Montgomery, escalada a SI)
- Malla gravitatoria deformada por el campo
- Controles: pausa, velocidad, toggle de malla, reinicio
- Atajos: `Espacio`, `G`, `R`

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

O desde este directorio:

```bash
cargo run
```

## Dirección (local primero)

1. **Ahora:** simulación local estable (este crate).
2. **Después:** enriquecer la UI (cámaras, escenarios JSON de `datos/`).
3. **Más adelante (estilo GMAT):** herramientas de misión (órbitas, manibras,
   reportes) reutilizando el mismo motor in-process; la web puede llegar como
   vista secundaria, no como dependencia del bucle de física.

## Nota sobre GMAT

En este entorno cloud no hay instalador/zip de NASA GMAT en Downloads.
Si en el PC local queda GMAT en Descargas, sirve como referencia de UX
(misión / análisis), no como dependencia de build de Fractal.
