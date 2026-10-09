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

/// Día en segundos (86400 s).
pub const DIA: f64 = 86400.0;

/// Año juliano en días (365.25 días).
pub const ANO_JULIANO: f64 = 365.25;
