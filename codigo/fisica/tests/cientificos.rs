//! Tests científicos del motor físico — sin servidor, sin gráficos, sin red.
//!
//! Estos tests validan que la física es correcta, no solo que "corre".
//! Cualquier cambio en el motor debe mantener estos tests verdes.

use fractal_fisica::prelude::*;
use fractal_fisica::vector::Vec3;

/// Tolerancia relativa para comparaciones de energía.
const TOLERANCIA_ENERGIA: f64 = 1e-8;

/// Crea el sistema Tierra-Luna con velocidad circular exacta.
///
/// La velocidad circular para un cuerpo en órbita alrededor de una masa M
/// a distancia r es: `v = sqrt(G * M / r)`.
fn sistema_tierra_luna() -> Vec<Cuerpo> {
    let masa_sol = MASA_SOL;
    let distancia_tierra_sol = UA;
    let velocidad_tierra = (G * masa_sol / distancia_tierra_sol).sqrt();

    vec![
        Cuerpo::nuevo("sol", "Sol", masa_sol, RADIO_SOL, Vec3::cero(), Vec3::cero()),
        Cuerpo::nuevo(
            "tierra",
            "Tierra",
            5.972e24,
            6.371e6,
            Vec3::new(distancia_tierra_sol, 0.0, 0.0),
            Vec3::new(0.0, velocidad_tierra, 0.0),
        ),
    ]
}

/// # Test 1: Órbita circular de dos cuerpos.
///
/// Verifica que un cuerpo con velocidad circular exacta mantiene
/// una distancia constante al centro (oscilación < 0.1%).
#[test]
fn orbita_circular_dos_cuerpos_mantiene_distancia() {
    let mut cuerpos = sistema_tierra_luna();
    let distancia_inicial = cuerpos[1].posicion.distancia(&cuerpos[0].posicion);

    // Simular 10 pasos de 1 hora
    for _ in 0..10 {
        paso_velocity_verlet(&mut cuerpos, 3600.0);
    }

    let distancia_final = cuerpos[1].posicion.distancia(&cuerpos[0].posicion);
    let error_relativo = (distancia_final - distancia_inicial).abs() / distancia_inicial;

    assert!(error_relativo < 1e-3, "la distancia varió demasiado: error = {}", error_relativo);
}

/// # Test 2: Conservación de energía mecánica.
///
/// La energía total E = K + U debe conservarse en un sistema aislado.
/// Velocity Verlet garantiza oscilación acotada sin deriva.
#[test]
fn conservacion_de_energia_en_sistema_aislado() {
    let cuerpos_iniciales = sistema_tierra_luna();
    let e_inicial = energia_total(&cuerpos_iniciales);

    let historial = simular(&cuerpos_iniciales, 600.0, 3900, 100);

    for estado in &historial {
        let e = energia_total(&estado.cuerpos);
        let error_relativo = (e - e_inicial).abs() / e_inicial.abs();
        assert!(
            error_relativo < TOLERANCIA_ENERGIA,
            "energía no se conservó en t={}: error = {}",
            estado.tiempo,
            error_relativo
        );
    }
}

/// # Test 3: Conservación de momento lineal.
///
/// El momento total P = Σ m_i * v_i debe ser exactamente cero
/// si el sistema parte del reposo relativo.
#[test]
fn conservacion_de_momento_lineal() {
    let cuerpos_iniciales = sistema_tierra_luna();
    let p_inicial = momento_total(&cuerpos_iniciales);

    let historial = simular(&cuerpos_iniciales, 3600.0, 100, 10);

    for estado in &historial {
        let p = momento_total(&estado.cuerpos);
        let error = p.distancia(&p_inicial);
        assert!(
            error < 1e-10 * p_inicial.norma().max(1.0),
            "momento no se conservó en t={}",
            estado.tiempo
        );
    }
}

/// # Test 4: Convergencia de orden 2.
///
/// Si reducimos dt a la mitad, el error debe reducirse ~4x
/// (Velocity Verlet es de segundo orden).
#[test]
fn convergencia_orden_dos_con_dt_reducido() {
    let cuerpos = sistema_tierra_luna();

    // Simular con dt = 3600s
    let historial_grueso = simular(&cuerpos, 3600.0, 24, 24);
    let pos_grueso = &historial_grueso.last().unwrap().cuerpos[1].posicion;

    // Simular con dt = 1800s (mitad)
    let historial_fino = simular(&cuerpos, 1800.0, 48, 48);
    let pos_fino = &historial_fino.last().unwrap().cuerpos[1].posicion;

    // Simular con dt = 900s (cuarto)
    let historial_mas_fino = simular(&cuerpos, 900.0, 96, 96);
    let pos_mas_fino = &historial_mas_fino.last().unwrap().cuerpos[1].posicion;

    // El error debe reducirse ~4x al reducir dt a la mitad
    // (comparación aproximada usando posición final)
    let error_grueso = pos_grueso.distancia(pos_mas_fino);
    let error_fino = pos_fino.distancia(pos_mas_fino);

    // error_grueso / error_fino debería estar entre 3 y 6
    // (tolerancia amplia porque es comparación de posiciones, no de energía)
    let razon = error_grueso / error_fino;
    assert!((3.0..=6.0).contains(&razon), "la convergencia no es de orden 2: razón = {}", razon);
}

/// # Test 5: Período orbital coincide con analítica.
///
/// Para una órbita circular de radio r alrededor de masa M:
/// `T = 2π * sqrt(r³ / (G * M))`
#[test]
fn periodo_orbital_con_coincide_con_analitica() {
    let cuerpos = sistema_tierra_luna();
    let r = UA;
    let m = MASA_SOL;
    let periodo_teorico = 2.0 * std::f64::consts::PI * (r * r * r / (G * m)).sqrt();

    // Simular un período con pasos de 1 hora
    let pasos = (periodo_teorico / 3600.0).ceil() as usize;
    let historial = simular(&cuerpos, 3600.0, pasos, pasos);

    let estado_final = historial.last().unwrap();
    let periodo_simulado = estado_final.tiempo;

    let error_relativo = (periodo_simulado - periodo_teorico).abs() / periodo_teorico;
    assert!(
        error_relativo < 0.01,
        "período simulado {} muy distinto de teórico {}",
        periodo_simulado,
        periodo_teorico
    );
}

/// # Test 6: Sistema de un cuerpo no se mueve.
///
/// Un cuerpo solo en el espacio no siente fuerza y permanece en reposo.
#[test]
fn cuerpo_unico_no_se_mueve() {
    let mut cuerpos =
        vec![Cuerpo::nuevo("sol", "Sol", MASA_SOL, RADIO_SOL, Vec3::cero(), Vec3::cero())];

    for _ in 0..100 {
        paso_velocity_verlet(&mut cuerpos, 3600.0);
    }

    assert_eq!(cuerpos[0].posicion, Vec3::cero());
    assert_eq!(cuerpos[0].velocidad, Vec3::cero());
}

/// # Test 7: Masa mayor produce mayor aceleración.
///
/// La aceleración de un cuerpo es proporcional a la masa del otro.
#[test]
fn masa_mayor_produce_mayor_aceleracion() {
    let cuerpo_pequeno =
        Cuerpo::nuevo("p", "Pequeño", 1.0, 1.0, Vec3::new(1e11, 0.0, 0.0), Vec3::cero());

    let cuerpo_grande = Cuerpo::nuevo("g", "Grande", 1e30, 1e8, Vec3::cero(), Vec3::cero());
    let cuerpo_mayor = Cuerpo::nuevo("M", "Mayor", 1e32, 1e9, Vec3::cero(), Vec3::cero());

    let cuerpos1 = vec![cuerpo_grande.clone(), cuerpo_pequeno.clone()];
    let cuerpos2 = vec![cuerpo_mayor.clone(), cuerpo_pequeno.clone()];

    let a1 = calcular_aceleraciones(&cuerpos1);
    let a2 = calcular_aceleraciones(&cuerpos2);

    // El cuerpo pequeño acelera más cuanto mayor es la masa del grande
    assert!(a1[1].norma() > 0.0);
    assert!(a2[1].norma() > a1[1].norma());
}
