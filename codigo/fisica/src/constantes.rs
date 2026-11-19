//! Constantes físicas del Sistema Solar y del universo.
//!
//! # Fuentes
//!
//! * G: CODATA 2018
//! * UA: IAU 2012
//! * Masas y radios: IERS 2009, NASA fact sheets

/// Constante gravitacional universal `G` en m³/(kg·s²).
///
/// Fuente: CODATA 2018.
pub const G: f64 = 6.67430e-11;

/// Unidad astronómica en metros.
///
/// Fuente: IAU 2012, exacta por definición.
pub const UA: f64 = 1.495978707e11;

/// Masa del Sol en kilogramos.
pub const MASA_SOL: f64 = 1.98892e30;

/// Radio del Sol en metros.
pub const RADIO_SOL: f64 = 6.957e8;

/// Masa de la Tierra en kilogramos.
pub const MASA_TIERRA: f64 = 5.972e24;

/// Radio ecuatorial de la Tierra en metros.
pub const RADIO_TIERRA: f64 = 6.378137e6;

/// Coeficiente zonal J₂ de la Tierra (IERS / EGM96 orden de magnitud).
pub const J2_TIERRA: f64 = 1.08262668e-3;

/// Masa de la Luna en kilogramos.
pub const MASA_LUNA: f64 = 7.342e22;

/// Radio de la Luna en metros.
pub const RADIO_LUNA: f64 = 1.737e6;

/// Día en segundos (86400 s).
pub const DIA: f64 = 86400.0;

/// Año juliano en días (365.25 días).
pub const ANO_JULIANO: f64 = 365.25;
