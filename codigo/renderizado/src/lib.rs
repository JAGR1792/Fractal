//! Punto de entrada de fractal-renderizado.
//!
//! Biblioteca pura: interpolación + culling. Sin wgpu/wasm-bindgen aquí
//! para que `cargo test` corra en nativo. El binding WASM vive en
//! `aplicaciones/web` (wasm-pack) y llama a estas funciones.

pub mod culling;
pub mod interpolador;

pub mod prelude {
    pub use crate::culling::{Frustum, esfera_visible, filtrar_visibles};
    pub use crate::interpolador::interpolar_posiciones;
}
