//! Servidor API Fractal — Etapa 3.
//!
//! Expone el motor [`fractal_fisica`] por HTTP con Axum + Tokio:
//! las simulaciones corren en background y el frontend ULTRA/LITE
//! consume primero JSON (configuración) y luego estados.
//!
//! # Endpoints mínimos
//!
//! * `GET /salud` — chequeo de vida.
//! * `POST /api/v1/simulaciones` — crea una simulación (202).
//! * `GET /api/v1/simulaciones/:id` — estado y progreso.
//! * `GET /api/v1/simulaciones/:id/estados` — estados registrados (`desde`, `limite`).
//!
//! El protocolo binario (`Float32Array`, ver `aplicaciones/web/src/binario.ts`)
//! llega después; esta etapa devuelve JSON para validar el flujo completo.

pub mod almacen;
pub mod modelos;
pub mod rutas;

pub use rutas::crear_app;
