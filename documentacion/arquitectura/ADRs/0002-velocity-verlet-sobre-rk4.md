# ADR-0002: Velocity Verlet sobre Runge-Kutta 4

## Estado
Aceptado

## Contexto

Para integrar las ecuaciones de movimiento, necesitamos un método numérico. Las candidatas principales eran:
- **RK4**: clásico, orden 4, 4 evaluaciones de fuerzas por paso
- **Velocity Verlet**: orden 2, 1 evaluación por paso, conserva energía
- **Dormand-Prince**: adaptativo, 6 evaluaciones, más complejo

## Decisión

Usamos **Velocity Verlet** como integrador principal en v1.

## Justificación

En simulaciones gravitacionales de largo plazo (días, años, siglos), lo que importa no es la precisión por paso sino la **conservación de energía**:

| Método | Energía a 10 000 pasos | Precisión paso | Coste |
|--------|------------------------|----------------|-------|
| RK4 | Deriva lenta (~1e-4) | Excelente (O(dt⁵)) | 4 evals |
| Velocity Verlet | Oscila sin derivar (~1e-8) | Buena (O(dt³)) | 1 eval |

RK4 es más preciso por paso pero **deriva energía** con el tiempo. Para un simulador educativo donde el estudiante deja corriendo el sistema solar por "10 años", esa deriva se acumula y las órbitas se deshacen.

Verlet tiene orden 2 (menos preciso por paso) pero al ser **simétrico** y **reversible**, la energía total oscila pero nunca deriva. Es la razón por la que se usa en dinámica molecular y simulaciones N-cuerpos educativas.

## Consecuencias

### Ganamos
- 1 evaluación de fuerzas por paso (4x más rápido que RK4)
- Conservación de energía excelente a largo plazo
- Simple de implementar (~15 líneas)
- Pedagógicamente transparente

### Perdemos
- Menor precisión por paso (orden 2 vs orden 4)
- No tiene paso adaptativo (encuentros cercanos son problemáticos)
- Para órbitas muy excéntricas puede requerir dt pequeño

### Plan B
Si en el futuro necesitamos paso adaptativo (colisiones, encuentros cercanos), implementamos Dormand-Prince como integrador opcional, manteniendo Verlet como default.

---

**Fecha:** 2026-10-09
**Decisores:** Equipo Fractal
