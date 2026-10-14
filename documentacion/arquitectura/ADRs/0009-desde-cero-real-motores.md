# ADR-0009: Desde cero y real (Three.js para LITE, ULTRA a mano, escala real)

## Estado
Aceptado para la rama `experimento_nuevo_render`. Excepción acotada a
ADR-0005 (que prohíbe motores): solo LITE, solo tras el núcleo común, solo
con veredicto medido.

## Contexto

El usuario ordenó lo mejor desde cero y real. El diagnóstico (ADR-0008) dice
que los parones son inanición del streaming (probada por matemática), no
misterio de GPU. Pero queda una pregunta abierta que solo un experimento A/B
responde: ¿nuestro WebGL2 escrito a mano aporta algún parón propio frente a
un motor maduro con el mismo feed de datos? `renderizador.md` exige ADR nuevo
para reintroducir un motor: es este.

## Decisión

- **LITE-motor (experimento A/B): Three.js vendorizado por npm
  (`three@0.186`, `@types/three` en dev), solo detrás de `?perfil=motor`.**
  El comportamiento por defecto no cambia: `ultra`/`lite` siguen como están.
  El backend Three implementa el mismo contrato `Control` y se alimenta del
  mismo `NucleoReproduccion` (mismos números, mismo `cargando` honesto,
  mismos contadores). Esferas instanciadas (`InstancedMesh`, 1 draw),
  estelas con `LineSegments`, estrellas con `Points`, picking con
  `Raycaster`, texturas locales con `TextureLoader` (colegios sin internet:
  el bundle lo incluye, sin hotlinks). Cero allocs por cuadro: matrices e
  instancias reutilizadas.
- **ULTRA sigue a mano.** El reescrito WebGPU desde cero (Hermite en shader,
  anillo en GPU, render bundles) va después, en esta misma rama. Lo mejor
  sin importar la dificultad, donde de verdad paga.
- **Escala real opcional (`?real=1`).** Un solo factor común metros→mundo
  para posiciones Y radios (proporciones verdaderas), con etiqueta del
  factor en la barra. La exagerada sigue por defecto (a escala real los
  planetas son sub-píxel salvo zoom). Cambiar de modo recarga (como el
  selector de escenario): reescalar en caliente sería teletransportar.
- **Veredicto con números, no con gusto:** si el motor vuela y el nuestro
  no con el mismo feed, el problema era nuestro WebGL2; si ambos se traban
  igual, es el productor. Lo dice el overlay (`#medicion`), no una opinión.

## Consecuencias

### Ganamos
- A/B limpio: mismo núcleo, distinto dibujo. Comparación honesta.
- Picking, texturas sRGB y mipmaps regalados en el experimento.
- La escala real deja de ser deuda (Fase 3 del plan viejo).

### Perdemos / riesgos
- ~600KB de bundle solo cuando se pide el perfil motor (import dinámico:
  `ultra`/`lite` no lo pagan).
- Excepción a ADR-0005 acotada a esta rama y a LITE: si el veredicto sale
  mal, se borra el backend sin tocar nada más.
- Three.js exige WebGL2 igualmente: el fallback de tabla accesible sigue
  mandando cuando no hay GPU (nunca pantalla negra).

---

**Fecha:** 2026-10-14
**Decisores:** Jorge + Alya
**Relacionado:** ADR-0005, ADR-0007, ADR-0008, `documentacion/arquitectura/renderizador.md`
