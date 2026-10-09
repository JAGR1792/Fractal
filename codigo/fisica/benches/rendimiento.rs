//! Benchmarks de rendimiento con criterion.
//!
//! Detectan regresiones automáticamente en CI.
//! Ejecutar: cargo bench --bench rendimiento

use criterion::{Criterion, criterion_group, criterion_main};
use fractal_fisica::prelude::*;
use std::hint::black_box;

fn bench_sistema_solar_100_pasos(c: &mut Criterion) {
    let mut cuerpos =
        vec![Cuerpo::nuevo("sol", "Sol", MASA_SOL, RADIO_SOL, Vec3::cero(), Vec3::cero())];

    let planetas: Vec<(&str, &str, f64, f64, f64)> = vec![
        ("mercurio", "Mercurio", 3.285e23, 2.4397e6, 0.387),
        ("venus", "Venus", 4.867e24, 6.0518e6, 0.723),
        ("tierra", "Tierra", 5.972e24, 6.371e6, 1.0),
        ("marte", "Marte", 6.39e23, 3.3895e6, 1.524),
        ("jupiter", "Jupiter", 1.898e27, 6.9911e7, 5.203),
        ("saturno", "Saturno", 5.683e26, 5.8232e7, 9.537),
        ("urano", "Urano", 8.681e25, 2.5362e7, 19.19),
        ("neptuno", "Neptuno", 1.024e26, 2.4622e7, 30.07),
    ];

    for (_, nombre, masa, radio, a_ua) in planetas {
        let v = (G * MASA_SOL / (a_ua * UA)).sqrt();
        cuerpos.push(Cuerpo::nuevo(
            nombre,
            nombre,
            masa,
            radio,
            Vec3::new(a_ua * UA, 0.0, 0.0),
            Vec3::new(0.0, v, 0.0),
        ));
    }

    c.bench_function("sistema_solar_100_pasos_dt_1h", |b| {
        b.iter(|| {
            let mut c = cuerpos.clone();
            for _ in 0..100 {
                paso_velocity_verlet(black_box(&mut c), black_box(3600.0));
            }
        })
    });
}

fn bench_aceleraciones_n_cuerpos(c: &mut Criterion) {
    c.bench_function("calcular_aceleraciones_10_cuerpos", |b| {
        b.iter(|| {
            let cuerpos: Vec<Cuerpo> = (0..10)
                .map(|i| {
                    Cuerpo::nuevo(
                        &format!("c{}", i),
                        &format!("Cuerpo {}", i),
                        1e24,
                        1e6,
                        Vec3::new(i as f64 * 1e11, 0.0, 0.0),
                        Vec3::new(0.0, 1e4, 0.0),
                    )
                })
                .collect();
            black_box(calcular_aceleraciones(black_box(&cuerpos)))
        })
    });
}

criterion_group!(benches, bench_sistema_solar_100_pasos, bench_aceleraciones_n_cuerpos);
criterion_main!(benches);
