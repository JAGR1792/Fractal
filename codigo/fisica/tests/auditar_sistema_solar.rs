//! Auditoría del escenario del Sistema Solar: física verificada, no solo "corre".
//!
//! Ejecutar con: cargo test -p fractal-fisica --test auditar_sistema_solar -- --nocapture
//!
//! Lee el escenario real de `datos/escenarios/sistema_solar.json` (nueve cuerpos)
//! y comprueba:
//!
//! 1. **Condiciones iniciales coherentes:** cada planeta llega al semieje y la
//!    excentricidad reales J2000, y su órbita está ligada (`e < 1`).
//! 2. **Conservación:** energía acotada en 10 años y momento angular conservado.
//! 3. **Estabilidad:** ningún planeta escapa y los semiejes no derivan.
//! 4. **Kepler:** el período que sale de los semiejes coincide con el real.
//!
//! El escenario antes tenía órbitas casi circulares (Mercurio e = 0,022 en vez
//! de 0,206) y semiejes equivocados (Saturno 9,72 UA en vez de 9,54), lo que
//! falseaba el período un 3%. Estos tests fijan el contrato.

use fractal_fisica::metricas::momento_angular_total;
use fractal_fisica::prelude::*;
use fractal_fisica::vector::Vec3;
use std::path::PathBuf;

const UA_M: f64 = 1.495978707e11;
/// Un año juliano en segundos.
const ANIO_S: f64 = 365.25 * 86400.0;
/// Tolerancia relativa para los invariantes conservados del sistema.
const TOLERANCIA_ENERGIA: f64 = 1e-8;
const TOLERANCIA_MOMENTO: f64 = 1e-12;

#[derive(serde::Deserialize)]
struct CuerpoJson {
    id: String,
    nombre: String,
    masa: f64,
    radio: f64,
    posicion: [f64; 3],
    velocidad: [f64; 3],
}

#[derive(serde::Deserialize)]
struct ParametrosJson {
    dt: f64,
    pasos: usize,
}

#[derive(serde::Deserialize)]
struct EscenarioJson {
    cuerpos: Vec<CuerpoJson>,
    parametros: ParametrosJson,
}

/// Elementos reales J2000 (NASA/JPL): semieje (UA), excentricidad, longitud
/// media y longitud del perihelio (grados). Mismo orden que el escenario.
const REALES: &[(&str, f64, f64, f64, f64)] = &[
    ("mercurio", 0.38709927, 0.20563593, 252.25032350, 77.45779628),
    ("venus", 0.72333566, 0.00677672, 181.97909950, 131.60246718),
    ("tierra", 1.00000261, 0.01671123, 100.46457166, 102.93768193),
    ("marte", 1.52371034, 0.09339410, -4.55343205, -23.94362959),
    ("jupiter", 5.20288700, 0.04838624, 34.39644051, 14.72847983),
    ("saturno", 9.53667594, 0.05386179, 49.95424423, 92.59887831),
    ("urano", 19.18916464, 0.04725744, 313.23810451, 170.95427630),
    ("neptuno", 30.06992276, 0.00859048, -55.12002969, 44.96476227),
];

/// Períodos orbitales reales en años, para el contrato de Kepler.
const PERIODOS_REALES_ANIOS: &[f64] =
    &[0.2408, 0.6152, 1.0000, 1.8808, 11.862, 29.457, 84.021, 164.79];

/// Ruta al escenario: relativa al manifiesto del crate (`codigo/fisica`).
fn ruta_escenario() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../datos/escenarios/sistema_solar.json")
}

fn cargar() -> (Vec<Cuerpo>, ParametrosJson) {
    let texto = std::fs::read_to_string(ruta_escenario()).expect("no se pudo leer el escenario");
    let esc: EscenarioJson = serde_json::from_str(&texto).expect("JSON del escenario inválido");
    let cuerpos = esc
        .cuerpos
        .iter()
        .map(|c| {
            Cuerpo::nuevo(
                &c.id,
                &c.nombre,
                c.masa,
                c.radio,
                Vec3::new(c.posicion[0], c.posicion[1], c.posicion[2]),
                Vec3::new(c.velocidad[0], c.velocidad[1], c.velocidad[2]),
            )
        })
        .collect();
    (cuerpos, esc.parametros)
}

/// Elementos orbitales heliocéntricos osculadores: (a, e, T).
fn elementos(cuerpos: &[Cuerpo], indice: usize) -> (f64, f64, f64) {
    let sol = &cuerpos[0];
    let c = &cuerpos[indice];
    let r = c.posicion - sol.posicion;
    let v = c.velocidad - sol.velocidad;
    let mu = G * (sol.masa + c.masa);
    let rn = r.norma();
    let v2 = v.punto(&v);
    let energia = v2 / 2.0 - mu / rn;
    let a = -mu / (2.0 * energia);
    let rv = r.punto(&v);
    let f = v2 - mu / rn;
    let e_vec = (r * f - v * rv) * (1.0 / mu);
    let e = e_vec.norma();
    let t = 2.0 * std::f64::consts::PI * (a * a * a / mu).sqrt();
    (a, e, t)
}

#[test]
fn las_condiciones_iniciales_son_las_reales_j2000() {
    let (cuerpos, _p) = cargar();
    assert_eq!(cuerpos.len(), REALES.len() + 1, "el escenario debe tener Sol + 8 planetas");
    assert_eq!(
        cuerpos[0].id, "sol",
        "el cuerpo 0 tiene que ser el Sol (el motor usa el índice 0 como central)"
    );

    for (i, (id, a_ua, e_real, _l, _varpi)) in REALES.iter().enumerate() {
        let j = i + 1;
        assert_eq!(cuerpos[j].id, *id, "orden de planetas inesperado en el índice {j}");
        let (a, e, _t) = elementos(&cuerpos, j);
        let a_ua_sim = a / UA_M;
        assert!(
            (a_ua_sim - a_ua).abs() / a_ua < 1e-4,
            "{id}: semieje {a_ua_sim:.5} UA debe ser el real {a_ua:.5} UA"
        );
        // El escenario existía con excentricidades casi nulas (Mercurio 0,022
        // frente a 0,206), que es lo que borraba las estaciones y falseaba
        // Kepler. Aquí se fija que sean las reales.
        assert!(
            (e - e_real).abs() / e_real.max(1e-3) < 0.05,
            "{id}: excentricidad {e:.5} debe ser la real {e_real:.5}"
        );
        assert!(e < 1.0, "{id}: la órbita debe estar ligada");
    }
}

#[test]
fn se_conservan_energia_y_momento_angular() {
    let (cuerpos, params) = cargar();
    let e0 = energia_total(&cuerpos);
    let l0 = momento_angular_total(&cuerpos);
    assert!(e0 < 0.0, "un sistema ligado tiene energía total negativa");

    let historial = simular(&cuerpos, params.dt, params.pasos, 199);
    let ultimo = historial.last().unwrap();
    let e1 = energia_total(&ultimo.cuerpos);
    let l1 = momento_angular_total(&ultimo.cuerpos);

    let deriva_e = (e1 - e0).abs() / e0.abs();
    let deriva_l = (l1 - l0).norma() / l0.norma();
    println!("deriva energía 10 años = {deriva_e:.3e}");
    println!("deriva |L|    10 años = {deriva_l:.3e}");

    assert!(deriva_e < TOLERANCIA_ENERGIA, "la energía derivó: {deriva_e:.3e}");
    assert!(deriva_l < TOLERANCIA_MOMENTO, "el momento angular derivó: {deriva_l:.3e}");

    // La oscilación de la energía debe quedar acotada en toda la serie, que es
    // lo que garantiza Velocity Verlet (sin deriva secular).
    let mut peor = 0.0f64;
    for estado in &historial {
        let d = (energia_total(&estado.cuerpos) - e0).abs() / e0.abs();
        if d > peor {
            peor = d;
        }
    }
    println!("peor desviación de energía = {peor:.3e}");
    assert!(peor < TOLERANCIA_ENERGIA, "oscilación de energía fuera de cota: {peor:.3e}");
}

#[test]
fn ningun_planeta_escapa_ni_deriva_su_semieje() {
    let (cuerpos, params) = cargar();
    let semiejes0: Vec<f64> = (1..cuerpos.len()).map(|j| elementos(&cuerpos, j).0).collect();
    let historial = simular(&cuerpos, params.dt, params.pasos, 999);

    for estado in &historial {
        for j in 1..cuerpos.len() {
            let (a, e, _t) = elementos(&estado.cuerpos, j);
            assert!(
                a.is_finite() && a > 0.0,
                "{} perdió su órbita en t={}",
                estado.cuerpos[j].id,
                estado.tiempo
            );
            assert!(e < 1.0, "{} escapó (e = {e}) en t={}", estado.cuerpos[j].id, estado.tiempo);
        }
    }

    println!("\n{:<10} {:>12} {:>12} {:>10}", "cuerpo", "a inicio (UA)", "a fin (UA)", "Δa/a");
    for j in 1..cuerpos.len() {
        let a0 = semiejes0[j - 1];
        let a1 = elementos(&historial.last().unwrap().cuerpos, j).0;
        let d = (a1 - a0).abs() / a0;
        println!("{:<10} {:>12.5} {:>12.5} {:>10.2e}", cuerpos[j].id, a0 / UA_M, a1 / UA_M, d);
        // El error de integración con dt = 3600 s en 10 años debe quedar
        // pequeño: por encima del 1% el dt del escenario no serviría.
        assert!(d < 0.01, "{}: el semieje derivó {d:.2e} en 10 años", cuerpos[j].id);
    }
}

#[test]
fn los_periodos_coinciden_con_kepler_y_con_la_realidad() {
    let (cuerpos, _p) = cargar();
    println!("\n{:<10} {:>14} {:>14} {:>12}", "cuerpo", "T (años) sim", "T real (años)", "error");
    for (i, (id, _a, _e, _l, _v)) in REALES.iter().enumerate() {
        let (_a_sim, _e_sim, t) = elementos(&cuerpos, i + 1);
        let t_anios = t / ANIO_S;
        let real = PERIODOS_REALES_ANIOS[i];
        let error = (t_anios - real).abs() / real;
        println!("{:<10} {:>14.4} {:>14.4} {:>12.2e}", id, t_anios, real, error);
        // Sin esto, el escenario anterior fallaba un 3% en Mercurio y Saturno
        // por arrastrar semiejes equivocados.
        assert!(error < 0.01, "{id}: período {t_anios:.4} años frente al real {real:.4}");
    }
}
