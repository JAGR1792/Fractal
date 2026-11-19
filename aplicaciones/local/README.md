# Fractal Local

Aplicación de escritorio con **egui/eframe**. La física (`fractal-fisica`) corre
**in-process**: no hace falta Axum, Vue ni pegamento web.

## Qué incluye (MVP GMAT-lite)

- Escenarios desde `datos/escenarios/*.json` (p. ej. **tres_cuerpos** figure-8,
  **dos_cuerpos** Tierra–Luna, **sistema_solar**)
- Selector de escenario en la barra superior
- Malla gravitatoria deformada por el campo
- Cámara: **zoom** (rueda), **pan** (arrastre), reset (`F` / doble clic / botón ⌖)
- Controles: pausa, velocidad, toggle de malla, reinicio
- Atajos: `Espacio`, `G`, `R`, `F`

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

Los JSON se resuelven desde `datos/escenarios/` (ruta relativa al crate o al cwd).
Si falta un fichero, el figure-8 embebido sigue disponible como fallback.

## Dirección (local primero)

1. **Ahora:** simulación local estable + escenarios JSON + cámara (este crate).
2. **Después:** más herramientas de misión (manibras, reportes, encuadre auto).
3. **Más adelante (estilo GMAT):** la web puede llegar como vista secundaria, no
   como dependencia del bucle de física.

## Nota sobre GMAT

En este entorno cloud no hay instalador/zip de NASA GMAT. Si en el PC local
queda GMAT en Descargas, sirve como referencia de UX (misión / análisis), no
como dependencia de build de Fractal.
