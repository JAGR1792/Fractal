# ADR-0004: Código y documentación en español

## Estado
Aceptado

## Contexto

Fractal es un proyecto educativo con audiencia hispanohablante (estudiantes, docentes, entusiastas). El equipo original es hispanohablante.

Sin embargo, la comunidad de código abierto es mayoritariamente anglosajona y los contribuyentes futuros pueden no hablar español.

## Decisión

**Código, documentación y commits en español.** Los nombres técnicos en inglés (WebGPU, Velocity Verlet, API) se mantienen cuando son términos establecidos.

## Justificación

1. **Audiencia principal:** estudiantes hispanohablantes que están aprendiendo programación y física simultáneamente. Un segundo idioma añade fricción innecesaria.
2. **Equipo:** los contribuyentes principales hablan español nativo.
3. **Comunidad latina:** hay una comunidad activa de Rust en español (Rust en Español, Rust Latam).

## Consecuencias

### Ganamos
- Barrera de entrada más baja para la audiencia objetivo
- Documentación más clara y precisa para hispanohablantes
- Código más legible para el equipo

### Perdemos
- Contribuyentes angloparlantes pueden sentirse excluidos (mitigamos con README en inglés opcional)
- Búsqueda de soluciones en Google puede dar resultados en inglés (pero los conceptos son universales)

### Mitigaciones
- Aceptamos contribuciones en inglés y las traducimos
- El README puede tener versión bilingüe en el futuro
- Los nombres de variables técnicas (struct, impl, fn) son universales

---

**Fecha:** 2026-10-09
**Decisores:** Equipo Fractal
