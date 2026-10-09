//! Interpolación lineal entre snapshots para Fractal ULTRA.
//!
//! # Por qué en Rust y no en TS
//!
//! El loop de render corre a 60fps. Interpolar N cuerpos en TS crea
//! arrays temporales por frame (GC). En Rust/WASM se reutiliza un buffer
//! pre-alocado: cero allocs en estado estable.
//!
//! # Formato
//!
//! Cada cuerpo son 6 f32: `[x, y, z, vx, vy, vz]`.
//! `anterior` y `siguiente` tienen `n_cuerpos * 6` elementos.

/// Interpola posiciones entre dos snapshots.
///
/// # Parámetros
/// * `anterior` — estado en t0, longitud `n*6`
/// * `siguiente` — estado en t1, misma longitud
/// * `t` — fracción 0.0 (t0) .. 1.0 (t1)
/// * `salida` — buffer reutilizable donde se escriben posiciones `n*3`
///
/// # Panics
/// Si las longitudes no cuadran o `t` está fuera de [0,1].
pub fn interpolar_posiciones(anterior: &[f32], siguiente: &[f32], t: f32, salida: &mut [f32]) {
    assert!((0.0..=1.0).contains(&t), "t debe estar en [0,1]");
    assert_eq!(anterior.len(), siguiente.len(), "snapshots de distinto tamaño");
    assert!(anterior.len().is_multiple_of(6), "cada cuerpo son 6 floats");
    let n = anterior.len() / 6;
    assert_eq!(salida.len(), n * 3, "salida debe ser n*3");

    for i in 0..n {
        let b = i * 6;
        let s = i * 3;
        // Solo posición (x,y,z). Velocidad no se dibuja, se usa para vectores aparte.
        salida[s] = anterior[b] + (siguiente[b] - anterior[b]) * t;
        salida[s + 1] = anterior[b + 1] + (siguiente[b + 1] - anterior[b + 1]) * t;
        salida[s + 2] = anterior[b + 2] + (siguiente[b + 2] - anterior[b + 2]) * t;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn interpola_a_la_mitad() {
        let a = vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let b = vec![10.0, 0.0, 0.0, 1.0, 0.0, 0.0];
        let mut salida = vec![0.0; 3];
        interpolar_posiciones(&a, &b, 0.5, &mut salida);
        assert!((salida[0] - 5.0).abs() < 1e-6);
    }

    #[test]
    fn extremos_devuelven_snapshot() {
        let a = vec![1.0, 2.0, 3.0, 0.0, 0.0, 0.0];
        let b = vec![4.0, 5.0, 6.0, 0.0, 0.0, 0.0];
        let mut salida = vec![0.0; 3];
        interpolar_posiciones(&a, &b, 0.0, &mut salida);
        assert_eq!(salida, vec![1.0, 2.0, 3.0]);
        interpolar_posiciones(&a, &b, 1.0, &mut salida);
        assert_eq!(salida, vec![4.0, 5.0, 6.0]);
    }

    #[test]
    #[should_panic(expected = "t debe estar en [0,1]")]
    fn t_fuera_de_rango_falla() {
        let a = vec![0.0; 6];
        let b = vec![0.0; 6];
        let mut salida = vec![0.0; 3];
        interpolar_posiciones(&a, &b, 2.0, &mut salida);
    }
}
