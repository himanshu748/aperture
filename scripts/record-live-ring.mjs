// Native fetch only. This runner never substitutes Ring responses, images or an answer.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Store } from '../server/store.mjs';
import { RingSessions } from '../server/ring.mjs';
import { createApp } from '../server/index.mjs';

const token = process.env.RING_PLAYGROUND_TOKEN;
const password = process.env.APERTURE_DEMO_PASSWORD;
if (!token || !password || password.length < 12) {
  console.error('Set RING_PLAYGROUND_TOKEN and APERTURE_DEMO_PASSWORD (12+ characters) in the environment. No credentials are printed.');
  process.exit(2);
}
const port = Number(process.env.APERTURE_CAPTURE_PORT || 4432);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid APERTURE_CAPTURE_PORT');
const base = `http://127.0.0.1:${port}`;
const stamp = new Date().toISOString().replaceAll(':', '-');
const out = resolve('.impeccable/review/live-ring', stamp);
await mkdir(out, { recursive: true, mode: 0o700 });
const receipt = { started_at: new Date().toISOString(), provider: 'official Ring API via native fetch',
  mode: 'operator-controlled live application, no fixtures', requests: [], frames: [], recipient_results: [],
  complete_flow_verified: false, limits: ['Local app and official simulator/device only; no hosted or physical-device claim.'] };
const store = new Store();
const owner = store.register({ name: 'Live capture owner', email: 'live-capture@example.test', password });
const ring = new RingSessions({ mediaHosts: (process.env.RING_MEDIA_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean),
  fetcher: async (url, options) => {
    const response = await fetch(url, options);
    const path = new URL(url).pathname;
    receipt.requests.push({ operation: path === '/v1/devices' ? 'discovery' : path.endsWith('/media/image/download') ? 'snapshot-request' : 'media-or-live-request', status: response.status });
    return response;
  } });
const app = await createApp({ store, ring, origin: base });
let browser, ownerContext, recipientContext, prompt, timer;
try {
  await new Promise((done, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', done); });
  browser = await chromium.launch({ headless: false });
  ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
  await ownerContext.addCookies([{ name: 'aperture_session', value: owner.token, url: base, httpOnly: true, sameSite: 'Strict' }]);
  const connected = await ownerContext.request.post(base + '/api/ring/connect', { headers: { Origin: base }, data: { token, consent: true } });
  if (!connected.ok()) throw new Error(`Official Ring connection failed (HTTP ${connected.status()}); obtain a current authorized token. No retry or fixture is substituted.`);
  const ownerPage = await ownerContext.newPage();
  ownerPage.on('response', async response => {
    try {
      const path = new URL(response.url()).pathname;
      if (response.ok() && (path === '/api/ring/reference' || /\/ring-snapshot$/.test(path))) {
        const frame = await response.json();
        receipt.frames.push({ operation: path === '/api/ring/reference' ? 'reference' : 'observation', capturedAt: frame.capturedAt, downloadedAt: frame.downloadedAt,
          sourceTimeVerified: frame.sourceTimeVerified, fresh: frame.fresh, mediaOrigin: frame.mediaOrigin });
      }
    } catch { /* Closing the browser may cancel a response; no result is inferred. */ }
  });
  await ownerPage.goto(base);
  await ownerPage.getByRole('button', { name: 'Ring source', exact: true }).click();
  recipientContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: out, size: { width: 1440, height: 900 } } });
  const recipientPage = await recipientContext.newPage();
  recipientPage.on('response', async response => {
    try {
      // Never write a bearer URL, request body, private image, note or account credential.
      if (!response.ok() || !/\/api\/p\/[^/]+\/checks\/[^/]+$/.test(new URL(response.url()).pathname)) return;
      const data = await response.json();
      if (!['visible', 'not_visible', 'cannot_verify'].includes(data.result)) return;
      if (receipt.recipient_results.some(r => r.result === data.result && r.observedAt === data.observedAt)) return;
      receipt.recipient_results.push({ result: data.result, observedAt: data.observedAt, completedAt: data.completedAt, provider: data.provider });
    } catch { /* A canceled read is not evidence. */ }
  });
  // A freshly created pass is opened locally in the second context, never printed.
  const passWatch = ownerPage.getByLabel('Private bearer link').waitFor({ timeout: 175000 }).then(async () => {
    const link = await ownerPage.getByLabel('Private bearer link').inputValue();
    if (new URL(link).origin !== base) throw new Error('Unexpected pass origin');
    await recipientPage.goto(link);
  }).catch(() => {});
  console.log('Recording live app pages. Select a Ring camera, fetch a reference, mark/name the real object and create a one-check pass.');
  console.log('The second tab opens the recipient pass. Request a check there; in the owner tab fetch a fresh Ring snapshot, review it and release only the supported answer.');
  console.log('Follow docs/LIVE-DEMO.md. No answer is selected by this script. Press Enter to finish; recording stops after 175 seconds.');
  prompt = createInterface({ input: process.stdin, output: process.stdout });
  await Promise.race([prompt.question(''), new Promise(done => { timer = setTimeout(done, 175000); })]);
  clearTimeout(timer);
  prompt.close();
  await ownerContext.close(); ownerContext = null;
  await recipientContext.close(); recipientContext = null;
  receipt.complete_flow_verified = receipt.frames.some(f => f.operation === 'reference') &&
    receipt.frames.some(f => f.operation === 'observation' && f.sourceTimeVerified === true && f.fresh === true &&
      receipt.recipient_results.some(r => ['visible', 'not_visible'].includes(r.result) &&
        r.provider === 'ring-snapshot-owner-review' && r.observedAt === f.capturedAt));
  void passWatch;
} catch (error) {
  receipt.failure = 'Live run did not complete. Check token authorization, fresh recorded media, exact download-host allowlist and browser prerequisites; no result was substituted.';
  console.error(receipt.failure);
  process.exitCode = 1;
} finally {
  clearTimeout(timer); prompt?.close();
  await ownerContext?.close(); await recipientContext?.close(); await browser?.close();
  ring.disconnect(owner.id);
  await app.close(); store.close();
  receipt.finished_at = new Date().toISOString();
  await writeFile(resolve(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(`Private raw videos and sanitized receipt saved under ${out}. Inspect the footage; the receipt does not verify video quality or a physical device.`);
}
