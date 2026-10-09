# ADR-0001: Motor físico sin dependencias externas

## Estado
Aceptado

## Contexto

El motor gravitacional es el núcleo de Fractal. Debe ser:
- **Testeable** sin levantar un servidor HTTP
- **Reutilizable** en CLI, API, tests y futuros bindings
- **Rápido** sin overhead de frameworks

Inicialmente consideramos usar `nalgebra` para álgebra lineal y `serde` serialización directamente en el motor.

## Decisión

El motor (`codigo/fisica/`) define sus propios tipos minimalistas:
- `Vec3` propio (3 x f64) con operaciones básicas
- `Cuerpo` como struct plano con campos públicos
- Sin dependencias externas en el crate raíz del motor

Las dependencias (serde, axum, etc.) viven en los crates que **consumen** el motor, no dentro del motor mismo.

## Consecuencias

### Ganamos
- El motor compila en <1 segundo
- Tests científicos corran sin I/O ni red
- Es trivial portar a WASM, embedded o Python bindings
- Cualquier estudiante puede entender el código completo

### Perdemos
- No tenemos quaterniones, rotaciones ni matrices 4x4 (por ahora)
- Reimplementamos suma, producto punto, norma (pero son 3 líneas)
- Si necesitamos álgebra avanzada después, la agregamos como dependencia opcional

### Riesgo
Si el proyecto crece a relatividad general o mecánica de fluidos, el motor simple puede quedarse corto. Para eso está la Etapa 7 (escalabilidad).

---

**Fecha:** 2026-10-09
**Decisores:** Equipo Fractal
