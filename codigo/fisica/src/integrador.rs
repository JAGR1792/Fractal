//! Integrador Velocity Verlet para sistemas N-cuerpos.
//!
//! # ¿Por qué Velocity Verlet?
//!
//! * Conservación de energía a largo plazo (oscilación acotada, sin deriva)
//! * Reversible en tiempo (simetría)
//! * Coste mínimo: 1 evaluación de fuerzas por paso
//!
//! Ver ADR-0002 y `documentacion/cientifico/integrador_verlet.md`.

use crate::cuerpo::Cuerpo;
use crate::gravedad::calcular_aceleraciones;

/// Un paso de Velocity Verlet para un sistema de N cuerpos.
///
/// # Algoritmo
///
/// ```text
/// 1. a(t) = calcular_aceleraciones(r(t))
/// 2. r(t+dt) = r(t) + v(t)*dt + 0.5*a(t)*dt²
/// 3. a(t+dt) = calcular_aceleraciones(r(t+dt))
/// 4. v(t+dt) = v(t) + 0.5*(a(t) + a(t+dt))*dt
/// ```
///
/// # Argumentos
///
/// * `cuerpos` — slice mutable de cuerpos (se actualiza in-place)
/// * `dt` — paso temporal en segundos (debe ser > 0)
///
/// # Complejidad
///
/// * Tiempo: O(N²) por paso
/// * Memoria: O(N) adicional
///
/// # Panics
///
/// Si `dt <= 0`, porque un paso negativo o cero rompe el método.
///
/// # Ejemplo
///
/// ```
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::integrador::paso_velocity_verlet;
/// use fractal_fisica::vector::Vec3;
///
/// let mut cuerpos = vec![
///     Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
///     Cuerpo::nuevo("t", "T", 5.972e24, 6.371e6,
///         Vec3::new(1.496e11, 0.0, 0.0), Vec3::new(0.0, 29780.0, 0.0)),
/// ];
/// let r_antes = cuerpos[1].posicion;
/// paso_velocity_verlet(&mut cuerpos, 3600.0); // 1 hora
/// // La Tierra se movió
/// assert!(cuerpos[1].posicion.distancia(&r_antes) > 0.0);
/// ```
pub fn paso_velocity_verlet(cuerpos: &mut [Cuerpo], dt: f64) {
    assert!(dt > 0.0, "el paso dt debe ser positivo");

    let n = cuerpos.len();

    // paso 1: aceleración actual
    let aceleraciones = calcular_aceleraciones(cuerpos);

    // paso 2: actualizar posiciones
    for i in 0..n {
        cuerpos[i].posicion += cuerpos[i].velocidad * dt + aceleraciones[i] * (0.5 * dt * dt);
    }

    // paso 3: nueva aceleración
    let nuevas_aceleraciones = calcular_aceleraciones(cuerpos);

    // paso 4: actualizar velocidades con promedio
    for i in 0..n {
        cuerpos[i].velocidad += (aceleraciones[i] + nuevas_aceleraciones[i]) * (0.5 * dt);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vector::Vec3;

    #[test]
    fn cuerpo_en_reposo_permanece_en_reposo() {
        let mut cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        paso_velocity_verlet(&mut cuerpos, 3600.0);
        assert_eq!(cuerpos[0].posicion, Vec3::cero());
        assert_eq!(cuerpos[0].velocidad, Vec3::cero());
    }

    #[test]
    #[should_panic(expected = "el paso dt debe ser positivo")]
    fn dt_no_puede_ser_negativo() {
        let mut cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        paso_velocity_verlet(&mut cuerpos, -1.0);
    }

    #[test]
    fn planeta_se_tras_lada_en_un_paso() {
        let mut cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "t",
                "T",
                5.972e24,
                6.371e6,
                Vec3::new(1.496e11, 0.0, 0.0),
                Vec3::new(0.0, 29780.0, 0.0),
            ),
        ];
        let antes = cuerpos[1].posicion;
        paso_velocity_verlet(&mut cuerpos, 3600.0);
        let desplazamiento = cuerpos[1].posicion.distancia(&antes);
        // En 1 hora a 29.78 km/s debería moverse ~107,208 km
        // Pero como orbita, el desplazamiento es un poco menos
        assert!(desplazamiento > 90_000_000.0);
        assert!(desplazamiento < 120_000_000.0);
    }
}
