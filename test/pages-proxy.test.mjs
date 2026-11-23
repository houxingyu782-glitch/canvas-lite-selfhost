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
      headers: {
        Authorization: 'Bearer test-only-token',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 CanvasLite/2.0.2',
      },
      redirect: 'manual',
    },
  ]);
});

const page = '<html><head><!--LOCAL_SERVER--></head><body>Canvas Lite</body></html>';
const htmlAssets = { ASSETS: { fetch: () => new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"' } }) } };

test('Pages pre-fills the configured Canvas address on the login page', async () => {
  const response = await worker.fetch(new Request(site), { ...htmlAssets, ...env });
  const html = await response.text();
  assert.ok(html.includes(`<script>window.__CANVAS_LITE_BASE__=${JSON.stringify(origin)}</script>`));
  assert.ok(!html.includes('<!--LOCAL_SERVER-->'));
  assert.equal(response.headers.get('ETag'), null);
});

test('Pages leaves HTML untouched without a valid CANVAS_ORIGIN', async () => {
  for (const configuration of [{}, { CANVAS_ORIGIN: 'http://canvas.example.edu' }, { CANVAS_ORIGIN: 'https://canvas.example.edu/</script>' }]) {
    const html = await (await worker.fetch(new Request(site), { ...htmlAssets, ...configuration })).text();
    assert.equal(html, page);
  }
});

test('Pages does not rewrite non-HTML assets', async () => {
  const script = 'console.log("<!--LOCAL_SERVER-->")';
  const response = await worker.fetch(new Request(`${site}/js/app.js`), {
    ASSETS: { fetch: () => new Response(script, { headers: { 'Content-Type': 'text/javascript' } }) },
    ...env,
  });
  assert.equal(await response.text(), script);
});

test('Pages reports an upstream redirect instead of following it', async (t) => {
  // Workers 只认 follow / manual，传 error 会直接抛错，这里守住这个约束
  const upstream = t.mock.method(globalThis, 'fetch', (input, init) => {
    if (!['follow', 'manual'].includes(init.redirect)) throw new TypeError(`Invalid redirect value: ${init.redirect}`);
    return new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example.edu/login' } });
  });
  const response = await worker.fetch(canvasRequest(), env);
  assert.equal(upstream.mock.calls[0].arguments[1].redirect, 'manual');
  assert.equal(response.status, 502);
  assert.match((await response.json()).errors[0].message, /重定向/);
});

test('Pages reports a network failure', async (t) => {
  t.mock.method(globalThis, 'fetch', () => Promise.reject(new TypeError('network')));
  const response = await worker.fetch(canvasRequest(), env);
  assert.equal(response.status, 502);
  assert.match((await response.json()).errors[0].message, /无法连接/);
});

