//! Demostración de MPI (MS-MPI) para Fractal.
//!
//! Cada proceso calcula la aceleración de un subconjunto de cuerpos y el
//! proceso 0 reduce (suma) los resultados. Se valida contra el cálculo serial.
//!
//! Ejecutar con:
//!   mpiexec -n 4 cargo run --manifest-path codigo/mpi/Cargo.toml

use fractal_fisica::cuerpo::Cuerpo;
use fractal_fisica::gravedad::calcular_aceleraciones;
use fractal_fisica::vector::Vec3;
use std::ffi::c_void;

type MpiComm = i32;
const MPI_COMM_WORLD: MpiComm = 0x44000000u32 as i32;
const MPI_SUCCESS: i32 = 0;

#[repr(C)]
struct MpiStatus {
    internal: [i32; 2],
    mpi_source: i32,
    mpi_tag: i32,
    mpi_error: i32,
}

#[link(name = "msmpi", kind = "raw-dylib")]
unsafe extern "C" {
    fn MPI_Init(argc: *mut i32, argv: *mut *mut i8) -> i32;
    fn MPI_Finalize() -> i32;
    fn MPI_Comm_rank(comm: MpiComm, rank: *mut i32) -> i32;
    fn MPI_Comm_size(comm: MpiComm, size: *mut i32) -> i32;
    fn MPI_Barrier(comm: MpiComm) -> i32;
    fn MPI_Send(buf: *const c_void, count: i32, datatype: i32, dest: i32, tag: i32, comm: MpiComm) -> i32;
    fn MPI_Recv(buf: *mut c_void, count: i32, datatype: i32, source: i32, tag: i32, comm: MpiComm, status: *mut c_void) -> i32;
}

// MS-MPI datatypes (from mpi.h)
const MPI_DOUBLE: i32 = 0x4c00010b; // MPI_DOUBLE (may vary, but MS-MPI uses this)

fn main() {
    unsafe {
        let mut argc = 0;
        let mut argv: *mut i8 = std::ptr::null_mut();
        assert_eq!(MPI_Init(&mut argc, &mut argv), MPI_SUCCESS);

        let mut rank = 0;
        let mut size = 0;
        MPI_Comm_rank(MPI_COMM_WORLD, &mut rank);
        MPI_Comm_size(MPI_COMM_WORLD, &mut size);

        // Sistema de prueba
        let cuerpos = vec![
            Cuerpo::nuevo("sol", "Sol", 1.989e30, 6.957e8, Vec3::cero(), Vec3::cero()),
            Cuerpo::nuevo(
                "tierra",
                "Tierra",
                5.972e24,
                6.371e6,
                Vec3::new(1.496e11, 0.0, 0.0),
                Vec3::new(0.0, 29780.0, 0.0),
            ),
        ];
        let n = cuerpos.len();

        // Cada rank calcula aceleraciones para índices i donde i % size == rank
        let mut local = vec![Vec3::cero(); n];
        for i in 0..n {
            if i % (size as usize) != rank as usize {
                continue;
            }
            let mut a = Vec3::cero();
            for j in 0..n {
                if i == j {
                    continue;
                }
                let r = cuerpos[j].posicion - cuerpos[i].posicion;
                let dist2 = r.norma() * r.norma();
                let dist = dist2.sqrt();
                let factor = fractal_fisica::constantes::G * cuerpos[j].masa / (dist * dist2);
                a = a + r * factor;
            }
            local[i] = a;
        }

        // Enviar resultados al rank 0
        if rank != 0 {
            for i in 0..n {
                if i % (size as usize) == rank as usize {
                    MPI_Send(
                        &local[i] as *const Vec3 as *const c_void,
                        3,
                        MPI_DOUBLE,
                        0,
                        i as i32,
                        MPI_COMM_WORLD,
                    );
                }
            }
        } else {
            let mut globales = vec![Vec3::cero(); n];
            // rank 0 ya tiene los suyos
            for i in 0..n {
                if i % (size as usize) == 0 {
                    globales[i] = local[i];
                }
            }
            for src in 1..size {
                for i in 0..n {
                    if i % (size as usize) == src as usize {
                        let mut status = MpiStatus {
                            internal: [0, 0],
                            mpi_source: 0,
                            mpi_tag: 0,
                            mpi_error: 0,
                        };
                        MPI_Recv(
                            &mut globales[i] as *mut Vec3 as *mut c_void,
                            3,
                            MPI_DOUBLE,
                            src,
                            i as i32,
                            MPI_COMM_WORLD,
                            &mut status as *mut MpiStatus as *mut c_void,
                        );
                    }
                }
            }

            // Validar contra serial
            let ref_acels = calcular_aceleraciones(&cuerpos);
            println!("Rank 0: validación MPI vs serial");
            for i in 0..n {
                let err = (globales[i].x - ref_acels[i].x).abs()
                    + (globales[i].y - ref_acels[i].y).abs()
                    + (globales[i].z - ref_acels[i].z).abs();
                println!(
                    "  {}: err={:.3e}  (mpi=({:.6e},{:.6e},{:.6e}))",
                    cuerpos[i].nombre, err, globales[i].x, globales[i].y, globales[i].z
                );
            }
            println!("MPI demo completada con {} procesos.", size);
        }

        MPI_Barrier(MPI_COMM_WORLD);
        MPI_Finalize();
    }
}