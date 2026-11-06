import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const payload = JSON.stringify({
  cuerpos: [
    { id: 'a', nombre: 'A', masa: 1e30, radio: 1e8, posicion: { x: 0, y: 0, z: 0 }, velocidad: { x: 0, y: 0, z: 0 } },
    { id: 'b', nombre: 'B', masa: 1e24, radio: 1e6, posicion: { x: 1e11, y: 0, z: 0 }, velocidad: { x: 0, y: 1e4, z: 0 } },
  ],
});

export default function () {
  const res = http.post('http://localhost:3000/api/v1/fuerzas/distribuida', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(0.1);
}