//! Integradores numéricos para sistemas N-cuerpos.
//!
//! * Velocity Verlet (defecto) — ADR-0002
//! * RK4 clásico — comparación didáctica estilo `Ex_Integrators` de GMAT

use crate::cuerpo::Cuerpo;
use crate::fuerzas::{ModeloFuerzas, calcular_aceleraciones_modelo};
use crate::vector::Vec3;

/// Selector de integrador (UI / escenarios).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Integrador {
    #[default]
    VelocityVerlet,
    Rk4,
}

impl Integrador {
    pub fn etiqueta(self) -> &'static str {
        match self {
            Self::VelocityVerlet => "Velocity Verlet",
            Self::Rk4 => "RK4",
        }
    }
}

/// Un paso de Velocity Verlet (Newton puro, compatibilidad).
pub fn paso_velocity_verlet(cuerpos: &mut [Cuerpo], dt: f64) {
    paso_con_modelo(cuerpos, dt, &ModeloFuerzas::solo_newton());
}

/// Un paso con el modelo de fuerzas e integrador Verlet.
pub fn paso_con_modelo(cuerpos: &mut [Cuerpo], dt: f64, modelo: &ModeloFuerzas) {
    assert!(dt > 0.0, "el paso dt debe ser positivo");
    let n = cuerpos.len();
    let aceleraciones = calcular_aceleraciones_modelo(cuerpos, modelo);
    for i in 0..n {
        cuerpos[i].posicion += cuerpos[i].velocidad * dt + aceleraciones[i] * (0.5 * dt * dt);
    }
    let nuevas = calcular_aceleraciones_modelo(cuerpos, modelo);
    for i in 0..n {
        cuerpos[i].velocidad += (aceleraciones[i] + nuevas[i]) * (0.5 * dt);
    }
}

fn derivadas(cuerpos: &[Cuerpo], modelo: &ModeloFuerzas) -> (Vec<Vec3>, Vec<Vec3>) {
    let a = calcular_aceleraciones_modelo(cuerpos, modelo);
    let v: Vec<Vec3> = cuerpos.iter().map(|c| c.velocidad).collect();
    (v, a)
}

/// Un paso RK4 clásico (posición/velocidad acopladas).
pub fn paso_rk4(cuerpos: &mut [Cuerpo], dt: f64, modelo: &ModeloFuerzas) {
    assert!(dt > 0.0, "el paso dt debe ser positivo");
    let n = cuerpos.len();
    let p0: Vec<Vec3> = cuerpos.iter().map(|c| c.posicion).collect();
    let v0: Vec<Vec3> = cuerpos.iter().map(|c| c.velocidad).collect();

    let eval = |pos: &[Vec3], vel: &[Vec3]| -> (Vec<Vec3>, Vec<Vec3>) {
        let mut tmp = cuerpos.to_vec();
        for i in 0..n {
            tmp[i].posicion = pos[i];
            tmp[i].velocidad = vel[i];
        }
        derivadas(&tmp, modelo)
    };

    let (k1v, k1a) = eval(&p0, &v0);

    let mut p = vec![Vec3::cero(); n];
    let mut v = vec![Vec3::cero(); n];
    for i in 0..n {
        p[i] = p0[i] + k1v[i] * (0.5 * dt);
        v[i] = v0[i] + k1a[i] * (0.5 * dt);
    }
    let (k2v, k2a) = eval(&p, &v);

    for i in 0..n {
        p[i] = p0[i] + k2v[i] * (0.5 * dt);
        v[i] = v0[i] + k2a[i] * (0.5 * dt);
    }
    let (k3v, k3a) = eval(&p, &v);

    for i in 0..n {
        p[i] = p0[i] + k3v[i] * dt;
        v[i] = v0[i] + k3a[i] * dt;
    }
    let (k4v, k4a) = eval(&p, &v);

    for i in 0..n {
        cuerpos[i].posicion = p0[i] + (k1v[i] + k2v[i] * 2.0 + k3v[i] * 2.0 + k4v[i]) * (dt / 6.0);
        cuerpos[i].velocidad = v0[i] + (k1a[i] + k2a[i] * 2.0 + k3a[i] * 2.0 + k4a[i]) * (dt / 6.0);
    }
}

/// Avanza un paso con el integrador elegido.
pub fn paso(cuerpos: &mut [Cuerpo], dt: f64, modelo: &ModeloFuerzas, integrador: Integrador) {
    match integrador {
        Integrador::VelocityVerlet => paso_con_modelo(cuerpos, dt, modelo),
        Integrador::Rk4 => paso_rk4(cuerpos, dt, modelo),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vector::Vec3;

    #[test]
    fn cuerpo_en_reposo_permanece_en_reposo() {
        let mut cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        paso_velocity_verlet(&mut cuerpos, 3600.0);
        assert_eq!(cuerpos[0].posicion, Vec3::cero());
        assert_eq!(cuerpos[0].velocidad, Vec3::cero());
    }

    #[test]
    #[should_panic(expected = "el paso dt debe ser positivo")]
    fn dt_no_puede_ser_negativo() {
        let mut cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        paso_velocity_verlet(&mut cuerpos, -1.0);
    }

    #[test]
    fn planeta_se_tras_lada_en_un_paso() {
        let mut cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "t",
                "T",
                5.972e24,
                6.371e6,
                Vec3::new(1.496e11, 0.0, 0.0),
                Vec3::new(0.0, 29780.0, 0.0),
            ),
        ];
        let antes = cuerpos[1].posicion;
        paso_velocity_verlet(&mut cuerpos, 3600.0);
        let desplazamiento = cuerpos[1].posicion.distancia(&antes);
        assert!(desplazamiento > 90_000_000.0);
        assert!(desplazamiento < 120_000_000.0);
    }

    #[test]
    fn rk4_tambien_mueve_el_planeta() {
        let mut cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "t",
                "T",
                5.972e24,
                6.371e6,
                Vec3::new(1.496e11, 0.0, 0.0),
                Vec3::new(0.0, 29780.0, 0.0),
            ),
        ];
        let antes = cuerpos[1].posicion;
        paso_rk4(&mut cuerpos, 3600.0, &ModeloFuerzas::solo_newton());
        assert!(cuerpos[1].posicion.distancia(&antes) > 90_000_000.0);
    }

    #[test]
    fn modelo_vacio_no_acelera_solitario() {
        let mut cuerpos =
            vec![Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero())];
        paso_con_modelo(
            &mut cuerpos,
            3600.0,
            &ModeloFuerzas { newton: false, j2: false, primario: None },
        );
        assert_eq!(cuerpos[0].posicion, Vec3::cero());
    }
}
