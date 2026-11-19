# Texturas planetarias (AppEscritorio)

Mapas equirectangulares **reales** usados por `fractal-local`.

## Origen

Derivadas de los assets de **GMAT R2026a** (`data/graphics/texture/`), a su vez
cortesía de JPL/Caltech/USGS, Celestia Motherlode y Björn Jónsson (ver
`README` de GMAT). Redimensionadas a 1024×512 JPEG para la app.

| Fichero        | Fuente GMAT                          |
|----------------|--------------------------------------|
| `tierra.jpg`   | ModifiedBlueMarble.jpg               |
| `luna.jpg`     | Moon_HermesCelestiaMotherlode.jpg    |
| `sol.jpg`      | Sun.jpg                              |
| `mercurio.jpg` | Mercury_JPLCaltech.jpg               |
| `venus.jpg`    | Venus_BjornJonsson.jpg               |
| `marte.jpg`    | Mars_JPLCaltechUSGS.jpg              |
| `jupiter.jpg`  | Jupiter_HermesCelestiaMotherlode.jpg |
| `saturno.jpg`  | Saturn_gradiusCelestiaMotherlode.jpg |
| `urano.jpg`    | Uranus_JPLCaltech.jpg                |
| `neptuno.jpg`  | Neptune_BjornJonsson.jpg             |
| `a/b/c.jpg`    | alias → marte / júpiter / neptuno    |

## Carga

`src/texturas.rs` busca primero aquí (`CARGO_MANIFEST_DIR/texturas`), luego el
espejo en `aplicaciones/web/public/texturas/`. Rechaza placeholders antiguos
(256×128 / &lt;20 KB).
