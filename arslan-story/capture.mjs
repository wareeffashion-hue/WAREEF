// Usage: node capture.mjs stills 1,2.5,...   |   node capture.mjs video out.mp4 [fps]
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [mode, arg, fpsArg] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
page.on('console', m => console.log('console:', m.text()));
await page.goto('file://' + path.join(here, 'index.html') + '?capture');
await page.evaluate(() => window.ready);
if (mode === 'stills') {
  for (const t of arg.split(',').map(Number)) {
    await page.evaluate(t => window.render(t), t);
    await page.screenshot({ path: path.join(process.env.OUT || here, `still_${String(t).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 80 });
  }
} else {
  const fps = Number(fpsArg || 30);
  const dur = await page.evaluate(() => window.DURATION);
  const n = Math.round(dur * fps);
  const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', arg], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => window.render(t), i / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
}
await browser.close();
