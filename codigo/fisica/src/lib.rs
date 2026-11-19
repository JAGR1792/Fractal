//! Punto de entrada del motor físico Fractal.
//!
//! # Módulos
//!
//! * [`vector`] — Vec3 minimalista
//! * [`cuerpo`] — Cuerpo celeste
//! * [`constantes`] — G, UA, masas y radios
//! * [`gravedad`] — cálculo de aceleraciones O(N²)
//! * [`fuerzas`] — capas Newton / J₂
//! * [`integrador`] — Velocity Verlet y RK4
//! * [`maniobra`] — burns impulsivos y Hohmann
//! * [`orbital`] — elementos, ground track, eclipse
//! * [`estado`] — simulación y snapshots
//! * [`metricas`] — energía, momento, diagnósticos

pub mod constantes;
pub mod cuerpo;
pub mod estado;
pub mod fuerzas;
pub mod gravedad;
pub mod integrador;
pub mod maniobra;
pub mod metricas;
pub mod orbital;
pub mod vector;

/// Re-exportaciones convenientes para uso común.
pub mod prelude {
    pub use crate::constantes::*;
    pub use crate::cuerpo::Cuerpo;
    pub use crate::estado::{Estado, simular};
    pub use crate::fuerzas::{ModeloFuerzas, calcular_aceleraciones_modelo};
    pub use crate::gravedad::calcular_aceleraciones;
    pub use crate::integrador::{
        Integrador, paso, paso_con_modelo, paso_rk4, paso_velocity_verlet,
    };
    pub use crate::maniobra::{EjeBurn, Hohmann, burn_impulsivo_vnb, target_apoapsis_dv};
    pub use crate::metricas::{Diagnostico, diagnosticar, energia_total, momento_total};
    pub use crate::orbital::{
        ElementosKepler, Iluminacion, LatLon, OMEGA_TIERRA, elementos_kepler, ground_track,
        iluminacion_satelite,
    };
    pub use crate::vector::Vec3;
}
