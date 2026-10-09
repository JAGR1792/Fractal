//! Punto de entrada del motor físico Fractal.
//!
//! # Módulos
//!
//! * [`vector`] — Vec3 minimalista
//! * [`cuerpo`] — Cuerpo celeste
//! * [`constantes`] — G, UA, masas y radios
//! * [`gravedad`] — cálculo de aceleraciones O(N²)
//! * [`integrador`] — Velocity Verlet
//! * [`estado`] — simulación y snapshots
//! * [`metricas`] — energía, momento, diagnósticos
//!
//! # Ejemplo rápido
//!
//! ```rust
//! use fractal_fisica::prelude::*;
//!
//! let mut cuerpos = vec![
//!     Cuerpo::nuevo("sol", "Sol", MASA_SOL, RADIO_SOL, Vec3::cero(), Vec3::cero()),
//!     Cuerpo::nuevo("t", "T", 5.972e24, 6.371e6,
//!         Vec3::new(UA, 0.0, 0.0), Vec3::new(0.0, 29780.0, 0.0)),
//! ];
//! let e_inicial = energia_total(&cuerpos);
//! let historial = simular(&cuerpos, 3600.0, 24, 6);
//! let e_final = energia_total(&historial.last().unwrap().cuerpos);
//! let error = (e_final - e_inicial).abs() / e_inicial.abs();
//! assert!(error < 1e-8, "la energía debe conservarse");
//! ```

pub mod constantes;
pub mod cuerpo;
pub mod estado;
pub mod gravedad;
pub mod integrador;
pub mod metricas;
pub mod vector;

/// Re-exportaciones convenientes para uso común.
pub mod prelude {
    pub use crate::constantes::*;
    pub use crate::cuerpo::Cuerpo;
    pub use crate::estado::{Estado, simular};
    pub use crate::gravedad::calcular_aceleraciones;
    pub use crate::integrador::paso_velocity_verlet;
    pub use crate::metricas::{Diagnostico, diagnosticar, energia_total, momento_total};
    pub use crate::vector::Vec3;
}
