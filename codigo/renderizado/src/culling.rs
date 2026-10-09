//! Culling esfera vs frustum en CPU (fallback si no hay compute shader).
//!
//! ULTRA prefiere `computo.wgsl`, pero LITE y tests usan esto.

/// Planos del frustum como [a,b,c,d] normalizados (6 planos).
pub type Frustum = [[f32; 4]; 6];

/// Dice si una esfera (centro + radio) es visible.
///
/// # Parámetros
/// * `centro` — [x,y,z] en espacio mundo
/// * `radio` — radio en mundo (usar radio visual, no físico)
/// * `frustum` — 6 planos extraídos de viewProj
pub fn esfera_visible(centro: [f32; 3], radio: f32, frustum: &Frustum) -> bool {
    for plano in frustum {
        let distancia =
            plano[0] * centro[0] + plano[1] * centro[1] + plano[2] * centro[2] + plano[3];
        if distancia < -radio {
            return false;
        }
    }
    true
}

/// Filtra índices visibles sin alocar de más: escribe en `salida` y devuelve conteo.
pub fn filtrar_visibles(
    posiciones: &[f32],
    radios: &[f32],
    frustum: &Frustum,
    salida: &mut [u32],
) -> usize {
    let n = radios.len();
    assert_eq!(posiciones.len(), n * 3);
    assert!(salida.len() >= n);
    let mut conteo = 0;
    for i in 0..n {
        let c = [posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2]];
        if esfera_visible(c, radios[i], frustum) {
            salida[conteo] = i as u32;
            conteo += 1;
        }
    }
    conteo
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frustum_amplio() -> Frustum {
        // Cubo [-10,10] en cada eje: planos x>=-10, x<=10, etc.
        [
            [1.0, 0.0, 0.0, 10.0],
            [-1.0, 0.0, 0.0, 10.0],
            [0.0, 1.0, 0.0, 10.0],
            [0.0, -1.0, 0.0, 10.0],
            [0.0, 0.0, 1.0, 10.0],
            [0.0, 0.0, -1.0, 10.0],
        ]
    }

    #[test]
    fn centro_visible() {
        assert!(esfera_visible([0.0, 0.0, 0.0], 1.0, &frustum_amplio()));
    }

    #[test]
    fn fuera_no_visible() {
        assert!(!esfera_visible([50.0, 0.0, 0.0], 1.0, &frustum_amplio()));
    }

    #[test]
    fn filtrar_devuelve_solo_visibles() {
        let pos = vec![0.0, 0.0, 0.0, 50.0, 0.0, 0.0];
        let radios = vec![1.0, 1.0];
        let mut salida = vec![0u32; 2];
        let n = filtrar_visibles(&pos, &radios, &frustum_amplio(), &mut salida);
        assert_eq!(n, 1);
        assert_eq!(salida[0], 0);
    }
}
