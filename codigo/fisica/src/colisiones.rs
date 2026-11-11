//! Detección y resolución de colisiones inelásticas entre cuerpos.

use crate::cuerpo::Cuerpo;

/// Fusiona cuerpos que se solapan (distancia <= suma de radios).
///
/// La fusión es inelástica: se conserva masa, momento lineal y (aprox.) volumen.
/// El cuerpo resultante queda en la posición del centro de masa.
pub fn fusionar_colisiones(cuerpos: &mut Vec<Cuerpo>) {
    let mut i = 0;
    while i < cuerpos.len() {
        let mut j = i + 1;
        while j < cuerpos.len() {
            let r = cuerpos[j].posicion - cuerpos[i].posicion;
            let dist = r.norma();
            let radio_suma = cuerpos[i].radio + cuerpos[j].radio;
            if dist <= radio_suma && radio_suma > 0.0 {
                // Fusión inelástica
                let m1 = cuerpos[i].masa;
                let m2 = cuerpos[j].masa;
                let m = m1 + m2;
                let pos = (cuerpos[i].posicion * m1 + cuerpos[j].posicion * m2) / m;
                let vel = (cuerpos[i].velocidad * m1 + cuerpos[j].velocidad * m2) / m;
                let radio = (cuerpos[i].radio.powi(3) + cuerpos[j].radio.powi(3)).cbrt();
                cuerpos[i].masa = m;
                cuerpos[i].radio = radio;
                cuerpos[i].posicion = pos;
                cuerpos[i].velocidad = vel;
                cuerpos[i].nombre = format!("{}+{}", cuerpos[i].nombre, cuerpos[j].nombre);
                cuerpos.remove(j);
            } else {
                j += 1;
            }
        }
        i += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cuerpo::Cuerpo;
    use crate::vector::Vec3;

    #[test]
    fn fusiona_dos_cuerpos_solapados() {
        let mut cuerpos = vec![
            Cuerpo::nuevo("a", "A", 1.0, 1.0, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo("b", "B", 1.0, 1.0, Vec3::new(1.5, 0.0, 0.0), Vec3::cero()),
        ];
        fusionar_colisiones(&mut cuerpos);
        assert_eq!(cuerpos.len(), 1);
        assert!((cuerpos[0].masa - 2.0).abs() < 1e-12);
    }
}
