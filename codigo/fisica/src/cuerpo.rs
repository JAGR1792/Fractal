//! Cuerpo celeste: masa, radio, posición y velocidad.
//!
//! # Unidades
//!
//! * Masa: kilogramos (kg)
//! * Radio físico: metros (m)
//! * Posición: metros (m)
//! * Velocidad: metros por segundo (m/s)
//!
//! El radio **físico** se usa solo para detección de colisiones y visualización.
//! En el cálculo gravitacional, los cuerpos se tratan como masas puntuales.

use crate::vector::Vec3;

/// Cuerpo celeste del sistema.
///
/// # Campos
///
/// * `id` — identificador único dentro del escenario (ej: `"tierra"`)
/// * `nombre` — nombre legible para humanos (ej: `"Tierra"`)
/// * `masa` — masa en kilogramos (kg)
/// * `radio` — radio físico en metros (m)
/// * `posicion` — posición en el espacio (m)
/// * `velocidad` — velocidad lineal (m/s)
///
/// # Ejemplo
/// ```
/// use fractal_fisica::cuerpo::Cuerpo;
/// use fractal_fisica::vector::Vec3;
///
/// let tierra = Cuerpo::nuevo(
///     "tierra",
///     "Tierra",
///     5.972e24,
///     6.371e6,
///     Vec3::cero(),
///     Vec3::new(0.0, 29780.0, 0.0),
/// );
/// assert_eq!(tierra.nombre, "Tierra");
/// assert!(tierra.masa > 0.0);
/// ```
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Cuerpo {
    /// Identificador único dentro del escenario
    pub id: String,
    /// Nombre legible (ej: "Tierra", "Luna", "Sol")
    pub nombre: String,
    /// Masa en kilogramos (kg)
    pub masa: f64,
    /// Radio físico en metros (m)
    pub radio: f64,
    /// Posición en metros (m)
    pub posicion: Vec3,
    /// Velocidad en metros por segundo (m/s)
    pub velocidad: Vec3,
}

impl Cuerpo {
    /// Crea un cuerpo celeste nuevo.
    ///
    /// # Parámetros
    /// * `id` — identificador único del escenario
    /// * `nombre` — nombre legible
    /// * `masa` — masa en kg (debe ser > 0)
    /// * `radio` — radio físico en m (debe ser > 0)
    /// * `posicion` — posición inicial en m
    /// * `velocidad` — velocidad inicial en m/s
    ///
    /// # Panics
    /// Si `masa <= 0` o `radio <= 0`, porque un cuerpo sin masa rompe
    /// la física y un cuerpo sin radio hace imposible detectar colisiones.
    pub fn nuevo(
        id: &str,
        nombre: &str,
        masa: f64,
        radio: f64,
        posicion: Vec3,
        velocidad: Vec3,
    ) -> Self {
        assert!(masa > 0.0, "la masa debe ser positiva");
        assert!(radio > 0.0, "el radio debe ser positivo");
        Self { id: id.to_string(), nombre: nombre.to_string(), masa, radio, posicion, velocidad }
    }

    /// Energía cinética del cuerpo: `K = 0.5 * m * v²`.
    pub fn energia_cinetica(&self) -> f64 {
        0.5 * self.masa * self.velocidad.punto(&self.velocidad)
    }

    /// Momento lineal del cuerpo: `p = m * v`.
    pub fn momento(&self) -> Vec3 {
        self.velocidad.escalar(self.masa)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cuerpo_valido() {
        let c = Cuerpo::nuevo("t", "T", 1.0, 1.0, Vec3::cero(), Vec3::cero());
        assert_eq!(c.id, "t");
        assert_eq!(c.masa, 1.0);
    }

    #[test]
    #[should_panic(expected = "la masa debe ser positiva")]
    fn masa_no_puede_ser_cero() {
        Cuerpo::nuevo("x", "X", 0.0, 1.0, Vec3::cero(), Vec3::cero());
    }

    #[test]
    fn energia_cinetica_en_reposo_es_cero() {
        let c = Cuerpo::nuevo("t", "T", 10.0, 1.0, Vec3::cero(), Vec3::cero());
        assert_eq!(c.energia_cinetica(), 0.0);
    }

    #[test]
    fn energia_cinetica_con_velocidad() {
        let c = Cuerpo::nuevo("t", "T", 2.0, 1.0, Vec3::cero(), Vec3::new(3.0, 0.0, 0.0));
        // K = 0.5 * 2 * 9 = 9
        assert!((c.energia_cinetica() - 9.0).abs() < 1e-15);
    }
}
