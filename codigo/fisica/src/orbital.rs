//! Elementos orbitales, ground track y eclipse (utilidades estilo GMAT).

use crate::constantes::G;
use crate::cuerpo::Cuerpo;
use crate::vector::Vec3;

/// Elementos keplerianos clásicos (órbita alrededor de un primario).
#[derive(Debug, Clone, Copy)]
pub struct ElementosKepler {
    pub a: f64,
    pub e: f64,
    pub i: f64,
    pub raan: f64,
    pub arg_peri: f64,
    pub anomalia_verdadera: f64,
    pub periodo: f64,
    pub rp: f64,
    pub ra: f64,
}

/// Calcula elementos keplerianos del cuerpo respecto al primario.
pub fn elementos_kepler(cuerpo: &Cuerpo, primario: &Cuerpo) -> Option<ElementosKepler> {
    let mu = G * primario.masa;
    let r = cuerpo.posicion.restar(&primario.posicion);
    let v = cuerpo.velocidad.restar(&primario.velocidad);
    let r_n = r.norma();
    let v_n = v.norma();
    if r_n < 1.0 || mu <= 0.0 {
        return None;
    }

    let h = r.cruz(&v);
    let h_n = h.norma();
    if h_n < 1e-12 {
        return None;
    }

    let n_vec = Vec3::new(-h.y, h.x, 0.0); // línea de nodos: k̂ × h
    let n_n = n_vec.norma();

    // e⃗ = ((v² - μ/r) r⃗ - (r·v) v⃗) / μ
    let e_vec = {
        let term = r.escalar(v_n * v_n - mu / r_n) - v.escalar(r.punto(&v));
        term.escalar(1.0 / mu)
    };
    let e = e_vec.norma();

    let energy = 0.5 * v_n * v_n - mu / r_n;
    let a = if energy < 0.0 { -mu / (2.0 * energy) } else { f64::INFINITY };
    let i = (h.z / h_n).clamp(-1.0, 1.0).acos();

    let raan = if n_n > 1e-12 {
        let cos_o = (n_vec.x / n_n).clamp(-1.0, 1.0);
        let o = cos_o.acos();
        if n_vec.y < 0.0 { std::f64::consts::TAU - o } else { o }
    } else {
        0.0
    };

    let arg_peri = if n_n > 1e-12 && e > 1e-8 {
        let cos_w = (n_vec.punto(&e_vec) / (n_n * e)).clamp(-1.0, 1.0);
        let w = cos_w.acos();
        if e_vec.z < 0.0 { std::f64::consts::TAU - w } else { w }
    } else {
        0.0
    };

    let anomalia_verdadera = if e > 1e-8 {
        let cos_nu = (e_vec.punto(&r) / (e * r_n)).clamp(-1.0, 1.0);
        let nu = cos_nu.acos();
        if r.punto(&v) < 0.0 { std::f64::consts::TAU - nu } else { nu }
    } else {
        0.0
    };

    let periodo = if a.is_finite() && a > 0.0 {
        std::f64::consts::TAU * (a * a * a / mu).sqrt()
    } else {
        f64::INFINITY
    };
    let rp = if a.is_finite() { a * (1.0 - e) } else { r_n };
    let ra = if a.is_finite() { a * (1.0 + e) } else { f64::INFINITY };

    Some(ElementosKepler { a, e, i, raan, arg_peri, anomalia_verdadera, periodo, rp, ra })
}

/// Latitud / longitud geocéntrica (rad) asumiendo primario ≈ Tierra en origen
/// y rotación sidérea con ángulo `theta` (rad) = ω · t.
#[derive(Debug, Clone, Copy)]
pub struct LatLon {
    pub lat: f64,
    pub lon: f64,
}

/// Velocidad angular sidérea de la Tierra (rad/s).
pub const OMEGA_TIERRA: f64 = 7.2921159e-5;

pub fn ground_track(pos_inercial: Vec3, tiempo: f64, omega: f64) -> LatLon {
    let r = pos_inercial.norma().max(1.0);
    let lat = (pos_inercial.z / r).clamp(-1.0, 1.0).asin();
    let theta = omega * tiempo;
    // Rotación Z: pasa de inercial a fixed.
    let x_f = pos_inercial.x * theta.cos() + pos_inercial.y * theta.sin();
    let y_f = -pos_inercial.x * theta.sin() + pos_inercial.y * theta.cos();
    let lon = y_f.atan2(x_f);
    LatLon { lat, lon }
}

/// Estado de iluminación de un satélite.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Iluminacion {
    Sol,
    Penumbra,
    Umbra,
}

/// Eclipse cilíndrico simplificado: Sol lejano en dirección `dir_sol` (unitario),
/// sombra detrás del primario de radio `radio_primario`.
pub fn iluminacion_satelite(
    pos_sat: Vec3,
    pos_primario: Vec3,
    dir_sol: Vec3,
    radio_primario: f64,
) -> Iluminacion {
    let Some(s_hat) = dir_sol.normalizar() else {
        return Iluminacion::Sol;
    };
    let rel = pos_sat.restar(&pos_primario);
    // Proyección sobre la dirección al Sol: >0 = lado diurno.
    let along = rel.punto(&s_hat);
    if along >= 0.0 {
        return Iluminacion::Sol;
    }
    let rho = rel.restar(&s_hat.escalar(along)).norma();
    // Umbra cilíndrica: radio = radio_primario; penumbra un 20 % mayor (juguete).
    if rho < radio_primario {
        Iluminacion::Umbra
    } else if rho < radio_primario * 1.2 {
        Iluminacion::Penumbra
    } else {
        Iluminacion::Sol
    }
}

/// Dirección Sol aproximada: desde el cuerpo más masivo llamado sol, o +X.
pub fn direccion_sol(cuerpos: &[Cuerpo], desde: Vec3) -> Vec3 {
    if let Some(sol) = cuerpos.iter().find(|c| matches!(c.id.as_str(), "sol" | "sun")) {
        sol.posicion.restar(&desde)
    } else {
        Vec3::new(1.0, 0.0, 0.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constantes::{MASA_TIERRA, RADIO_TIERRA};

    #[test]
    fn leo_circular_elementos() {
        let r = RADIO_TIERRA + 400e3;
        let v = (G * MASA_TIERRA / r).sqrt();
        let tierra = Cuerpo::nuevo(
            "tierra",
            "Tierra",
            MASA_TIERRA,
            RADIO_TIERRA,
            Vec3::cero(),
            Vec3::cero(),
        );
        let sat =
            Cuerpo::nuevo("sat", "Sat", 1.0, 1.0, Vec3::new(r, 0.0, 0.0), Vec3::new(0.0, v, 0.0));
        let el = elementos_kepler(&sat, &tierra).unwrap();
        assert!((el.e).abs() < 1e-4);
        assert!((el.a - r).abs() / r < 1e-4);
        assert!(el.periodo > 5000.0 && el.periodo < 6000.0);
    }

    #[test]
    fn eclipse_detras_de_la_tierra() {
        let tierra = Vec3::cero();
        let sol_dir = Vec3::new(1.0, 0.0, 0.0);
        let sat = Vec3::new(-RADIO_TIERRA - 500e3, 0.0, 0.0);
        assert_eq!(iluminacion_satelite(sat, tierra, sol_dir, RADIO_TIERRA), Iluminacion::Umbra);
        let sat_dia = Vec3::new(RADIO_TIERRA + 500e3, 0.0, 0.0);
        assert_eq!(iluminacion_satelite(sat_dia, tierra, sol_dir, RADIO_TIERRA), Iluminacion::Sol);
    }
}
