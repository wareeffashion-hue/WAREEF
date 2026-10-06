// Transactional email through Resend's HTTP API. Without RESEND_API_KEY the
// message is logged instead, so local development needs no setup.
import { config } from './config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function layout(title, bodyHtml, cta) {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#f6f6f4;font-family:Tahoma,Arial,sans-serif;color:#12152b">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
  <div style="margin-bottom:16px">${config.publicUrl
    ? `<img src="${esc(config.publicUrl)}/img/logo.png" alt="${esc(config.appName)}" height="40" style="height:40px;width:auto">`
    : `<strong style="font-size:18px">${esc(config.appName)}</strong>`}</div>
  <div style="background:#fff;border:1px solid #e4e3dd;border-radius:12px;padding:24px;line-height:1.8">
    <h1 style="font-size:18px;margin:0 0 12px">${esc(title)}</h1>
    ${bodyHtml}
    ${cta ? `<p style="margin:24px 0 8px"><a href="${esc(cta.url)}" style="background:#4335ec;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${esc(cta.label)}</a></p>` : ''}
  </div>
  <p style="color:#898781;font-size:12px;margin-top:16px">${config.supportEmail ? `للمساعدة: ${esc(config.supportEmail)}` : ''}</p>
</div></body></html>`;
}

export const sent = []; // last messages, for tests

export async function sendEmail({ to, subject, html }, { fetchImpl = fetch } = {}) {
  sent.push({ to, subject, html });
  if (sent.length > 50) sent.shift();
  if (!config.resendApiKey) {
    console.log(`[email] to=${to} subject="${subject}" (set RESEND_API_KEY to send)`);
    return { ok: true, logged: true };
  }
  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, html }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { ok: true };
  } catch (err) {
    console.error(`[email] failed to=${to}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export { esc };
