//! Protocolo binario v1 little-endian (pareja de `binario.ts`).
//!
//! Cada bloque son `1 + N*6` f32: `[t, x,y,z,vx,vy,vz × N]`.
//! El `Content-Type` es `application/octet-stream` con cabeceras
//! `x-fractal-version`, `x-fractal-cuerpos`, `x-fractal-bloques` y
//! `x-fractal-desde`. Sin `JSON.parse` ni GC en el frontend.

use fractal_fisica::estado::Estado;

/// Versión del protocolo (debe coincidir con `VERSION_BINARIO` en TS).
pub const VERSION_BINARIO: u32 = 1;
/// Flotantes por cuerpo en cada bloque (posición + velocidad).
pub const FLOTANTES_POR_CUERPO: usize = 6;

/// Serializa estados a bloques f32 little-endian.
///
/// # Argumentos
/// * `estados` — historial a serializar (ya paginado)
/// * `n_cuerpos` — cuerpos por bloque (de los parámetros originales)
///
/// # Retorna
/// * `Vec<u8>` — bytes listos para el cuerpo HTTP
///
/// # Ejemplo
/// ```
/// use fractal_api::binario::codificar;
/// use fractal_fisica::{cuerpo::Cuerpo, estado::Estado, vector::Vec3};
///
/// let cuerpos = vec![Cuerpo::nuevo("a", "A", 1.0, 1.0, Vec3::new(1.0, 2.0, 3.0), Vec3::cero())];
/// let bytes = codificar(&[Estado::nuevo(10.0, &cuerpos)], 1);
/// assert_eq!(bytes.len(), (1 + 6) * 4);
/// ```
pub fn codificar(estados: &[Estado], n_cuerpos: usize) -> Vec<u8> {
    let por_bloque = 1 + n_cuerpos * FLOTANTES_POR_CUERPO;
    let mut bytes = Vec::with_capacity(estados.len() * por_bloque * 4);
    for estado in estados {
        for valor in bloque(estado, n_cuerpos) {
            bytes.extend_from_slice(&valor.to_le_bytes());
        }
    }
    bytes
}

/// Un bloque como f32 en orden (rellena con ceros si faltan cuerpos).
fn bloque(estado: &Estado, n_cuerpos: usize) -> Vec<f32> {
    let mut salida = Vec::with_capacity(1 + n_cuerpos * FLOTANTES_POR_CUERPO);
    salida.push(estado.tiempo as f32);
    for cuerpo in estado.cuerpos.iter().take(n_cuerpos) {
        salida.extend([
            cuerpo.posicion.x as f32,
            cuerpo.posicion.y as f32,
            cuerpo.posicion.z as f32,
            cuerpo.velocidad.x as f32,
            cuerpo.velocidad.y as f32,
            cuerpo.velocidad.z as f32,
        ]);
    }
    while salida.len() < 1 + n_cuerpos * FLOTANTES_POR_CUERPO {
        salida.push(0.0);
    }
    salida
}

#[cfg(test)]
mod pruebas {
    use super::*;
    use fractal_fisica::{cuerpo::Cuerpo, vector::Vec3};

    fn dos_cuerpos() -> Vec<Estado> {
        let cuerpos = vec![
            Cuerpo::nuevo("tierra", "Tierra", 5.972e24, 6.371e6, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "luna",
                "Luna",
                7.342e22,
                1.737e6,
                Vec3::new(3.844e8, 0.0, 0.0),
                Vec3::new(0.0, 1022.0, 0.0),
            ),
        ];
        vec![Estado::nuevo(0.0, &cuerpos), Estado::nuevo(3600.0, &cuerpos)]
    }

    #[test]
    fn tamano_un_bloque_dos_cuerpos() {
        let bytes = codificar(&dos_cuerpos()[..1], 2);
        assert_eq!(bytes.len(), (1 + 2 * FLOTANTES_POR_CUERPO) * 4);
    }

    #[test]
    fn tiempos_y_luna_sobreviven_ida_vuelta() {
        let bytes = codificar(&dos_cuerpos(), 2);
        let (f32s, resto) = bytes.as_chunks::<4>();
        assert!(resto.is_empty());
        let f32s: Vec<f32> =
            f32s.iter().map(|pedazo| f32::from_le_bytes(*pedazo)).collect();
        assert_eq!(f32s.len(), 2 * (1 + 12));
        assert!((f32s[0] - 0.0).abs() < f32::EPSILON);
        assert!((f32s[13] - 3600.0).abs() < 0.001);
        // Luna del segundo bloque en x ≈ 3.844e8 (con error de f32)
        let x_luna = f32s[13 + 1 + 6];
        assert!((x_luna - 3.844e8).abs() / 3.844e8 < 1e-6);
    }
}
