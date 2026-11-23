import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../public/_worker.js';

const site = 'https://canvas-lite.example.com';
const origin = 'https://canvas.example.edu';
const env = { CANVAS_ORIGIN: origin };

function canvasRequest(headers = {}, method = 'GET') {
  return new Request(`${site}/api/v1/courses?page=2`, {
    method,
    headers: {
      'X-Canvas-Host': origin,
      Authorization: 'Bearer test-only-token',
      ...headers,
    },
  });
}

test('Pages serves static files without Canvas configuration', async () => {
  const response = await worker.fetch(new Request(site), {
    ASSETS: { fetch: () => new Response('Canvas Lite') },
  });
  assert.equal(await response.text(), 'Canvas Lite');
});

test('Pages rejects missing configuration, mismatched hosts and writes before forwarding', async (t) => {
  const upstream = t.mock.method(globalThis, 'fetch', () => new Response());
  for (const configuration of [{}, { CANVAS_ORIGIN: 'http://canvas.example.edu' }]) {
    assert.equal((await worker.fetch(canvasRequest(), configuration)).status, 503);
  }
  assert.equal((await worker.fetch(canvasRequest({ 'X-Canvas-Host': 'https://other.example.edu' }), env)).status, 400);
  assert.equal((await worker.fetch(canvasRequest({ Authorization: '' }), env)).status, 401);
  const write = await worker.fetch(canvasRequest({}, 'POST'), env);
  assert.equal(write.status, 405);
  assert.equal(write.headers.get('Allow'), 'GET, HEAD');
  assert.equal(upstream.mock.callCount(), 0);
});

test('Pages forwards reads to the configured origin and preserves Canvas pagination', async (t) => {
  const next = `<${origin}/api/v1/courses?page=3>; rel="next"`;
  const upstream = t.mock.method(globalThis, 'fetch', () => Response.json([{ id: 1 }], {
    headers: { Link: next, 'Set-Cookie': 'discard=1' },
  }));

  const response = await worker.fetch(canvasRequest({ Cookie: 'discard=1' }), env);
  assert.deepEqual(await response.json(), [{ id: 1 }]);
  assert.equal(response.headers.get('Link'), next);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.deepEqual(upstream.mock.calls[0].arguments, [
    `${origin}/api/v1/courses?page=2`,
    {
      method: 'GET',
      headers: { Authorization: 'Bearer test-only-token', Accept: 'application/json' },
      redirect: 'error',
    },
  ]);
});
