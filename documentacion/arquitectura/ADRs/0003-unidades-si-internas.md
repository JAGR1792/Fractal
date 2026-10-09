# ADR-0003: Unidades SI internas con conversión en bordes

## Estado
Aceptado

## Contexto

El sistema solar tiene escalas enormes: desde 10⁶ m (radio terrestre) hasta 10¹³ m (órbita de Neptuno). Si usamos UA internamente, un estudiante que ve `masa: 0.000003` no entiende qué es. Si usamos kg y metros, los números son enormes pero reconocibles.

También existen sistemas de unidades astronómicas (UA, M☉, años) que son más compactos pero requieren conversión constante.

## Decisión

**Internamente:** SI (metros, kg, segundos) en `f64`.
**En los bordes:** conversión al momento de recibir input (API) o mostrar resultados (JSON, interfaz).

## Consecuencias

### Ganamsos
- El código es transparente: `masa: 5.972e24` son kg, no "3 M☉"
- Los tests son verificables con calculadora
- Errores de conversión se localizan en un solo lugar (los bordes)

### Perdemos
- Los números son grandes en logs y JSON (pero `f64` los maneja bien)
- La interfaz gráfica necesita escalas logarítmicas o relativas (pero eso es normal en astronomía)

### Implementación

```rust
// En el motor: siempre SI
pub struct Cuerpo {
    pub masa: f64,       // kg
    pub posicion: Vec3,  // metros
    pub velocidad: Vec3, // m/s
}

// En la API: conversión al borde
impl Cuerpo {
    pub fn desde_ua(masa_kg: f64, posicion_ua: [f64; 3], velocidad_kms: [f64; 3]) -> Self {
        Self {
            masa: masa_kg,
            posicion: Vec3::new(
                posicion_ua[0] * UA_EN_METROS,
                posicion_ua[1] * UA_EN_METROS,
                posicion_ua[2] * UA_EN_METROS,
            ),
            velocidad: Vec3::new(
                velocidad_kms[0] * 1000.0,
                velocidad_kms[1] * 1000.0,
                velocidad_kms[2] * 1000.0,
            ),
        }
    }
}
```

---

**Fecha:** 2026-10-09
**Decisores:** Equipo Fractal
