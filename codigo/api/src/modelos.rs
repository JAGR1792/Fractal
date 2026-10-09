//! Modelos de la API: petición, respuestas y validación en español.
//!
//! Todo lo que entra por HTTP se valida aquí antes de tocar el motor.
//! El motor solo recibe datos sanos (regla de oro del proyecto).

use fractal_fisica::{cuerpo::Cuerpo, estado::Estado};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Límites sanos para no colgar el servidor en la Etapa 3.
pub const MAX_CUERPOS: usize = 128;
/// Pasos máximos por simulación en esta etapa (el resto llega con paginación/streaming).
pub const MAX_PASOS: usize = 200_000;

/// Petición para crear una simulación.
///
/// # Ejemplo
/// ```
/// use fractal_api::modelos::PeticionSimulacion;
/// use fractal_fisica::{cuerpo::Cuerpo, vector::Vec3};
///
/// let peticion = PeticionSimulacion {
///     cuerpos: vec![Cuerpo::nuevo("t", "T", 1.0, 1.0, Vec3::cero(), Vec3::cero())],
///     dt: 600.0,
///     pasos: 100,
///     cada_n: 10,
/// };
/// assert!(peticion.validar().is_ok());
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeticionSimulacion {
    /// Estado inicial del sistema (masas, posiciones y velocidades en SI).
    pub cuerpos: Vec<Cuerpo>,
    /// Paso temporal en segundos (debe ser finito y positivo).
    pub dt: f64,
    /// Número total de pasos Velocity Verlet a simular.
    pub pasos: usize,
    /// Registrar un estado cada N pasos (1 = todos).
    pub cada_n: usize,
}

impl PeticionSimulacion {
    /// Valida la petición y explica en español qué está mal.
    pub fn validar(&self) -> Result<(), String> {
        if self.cuerpos.is_empty() {
            return Err("la simulación necesita al menos un cuerpo".to_string());
        }
        if self.cuerpos.len() > MAX_CUERPOS {
            return Err(format!("demasiados cuerpos: {} > {MAX_CUERPOS}", self.cuerpos.len()));
        }
        if !self.dt.is_finite() || self.dt <= 0.0 {
            return Err("dt debe ser un número positivo y finito".to_string());
        }
        if self.pasos == 0 || self.pasos > MAX_PASOS {
            return Err(format!("pasos debe estar entre 1 y {MAX_PASOS}"));
        }
        if self.cada_n == 0 || self.cada_n > self.pasos {
            return Err("cada_n debe estar entre 1 y pasos".to_string());
        }
        Ok(())
    }
}

/// Estado de una simulación en background.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EstadoSimulacion {
    /// Aceptada pero aún no arranca el cálculo.
    Pendiente,
    /// El motor está integrando.
    Corriendo,
    /// Terminó y hay estados disponibles.
    Completada,
    /// Falló (parámetros, memoria, cancelación).
    Fallida,
}

/// Respuesta al crear una simulación (HTTP 202).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RespuestaCreacion {
    /// Identificador único para consultar después.
    pub id: Uuid,
    /// Siempre `pendiente` al crear.
    pub estado: EstadoSimulacion,
}

/// Información de una simulación para `GET /:id`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoSimulacion {
    /// Identificador único.
    pub id: Uuid,
    /// Estado actual.
    pub estado: EstadoSimulacion,
    /// Progreso estimado entre 0.0 y 1.0.
    pub progreso: f64,
    /// Cuántos estados hay listos para leer.
    pub total_estados: usize,
    /// Mensaje de error en español si falló.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Respuesta paginada de estados para `GET /:id/estados`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RespuestaEstados {
    /// Identificador de la simulación.
    pub id: Uuid,
    /// Estado actual de la simulación.
    pub estado: EstadoSimulacion,
    /// Desde qué índice se leyó.
    pub desde: usize,
    /// Estados devueltos (puede ser menos que `limite` al final).
    pub estados: Vec<Estado>,
}

/// Respuesta de `GET /salud`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfoSalud {
    /// Siempre `"bien"` si el servidor responde.
    pub estado: String,
    /// Versión del crate (para depurar desajustes con el frontend).
    pub version: String,
}

/// Error JSON de la API (siempre con campo `error` en español).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorApi {
    /// Mensaje legible en español.
    pub error: String,
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use fractal_fisica::vector::Vec3;

    fn cuerpo_minimo() -> Cuerpo {
        Cuerpo::nuevo("t", "T", 1.0, 1.0, Vec3::cero(), Vec3::cero())
    }

    #[test]
    fn rechaza_sin_cuerpos() {
        let peticion = PeticionSimulacion { cuerpos: vec![], dt: 1.0, pasos: 10, cada_n: 1 };
        assert!(peticion.validar().is_err());
    }

    #[test]
    fn rechaza_dt_invalido() {
        for dt in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let peticion =
                PeticionSimulacion { cuerpos: vec![cuerpo_minimo()], dt, pasos: 10, cada_n: 1 };
            assert!(peticion.validar().is_err(), "dt={dt} debió fallar");
        }
    }

    #[test]
    fn rechaza_pasos_fuera_de_rango() {
        let peticion =
            PeticionSimulacion { cuerpos: vec![cuerpo_minimo()], dt: 1.0, pasos: 0, cada_n: 1 };
        assert!(peticion.validar().is_err());
    }
}
