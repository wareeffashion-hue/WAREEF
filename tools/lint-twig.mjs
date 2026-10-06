// Parses every .twig template with twig.js to catch syntax errors before Salla does.
// Salla-only tags ({% component %}, {% hook %}, {% schema %}) are blanked first.
import Twig from 'twig';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src/views', import.meta.url).pathname;
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.twig') ? [p] : []; });
Twig.extend((T) => {
  for (const name of ['money', 'cdn', 'asset', 'time_ago', 'number', 'date_ago', 'currency', 'is_placeholder', 'snake_case', 'kebab_case', 'camel_case']) T.exports.extendFilter(name, (v) => v);
  for (const name of ['trans', 'is_page', 'is_link', 'link', 'old', 'pluralize', 'is_current_url']) T.exports.extendFunction(name, (v) => v);
});
let bad = 0;
for (const file of walk(root)) {
  const src = readFileSync(file, 'utf8').replace(/\{%-?\s*(component|hook|schema|endschema)\b[\s\S]*?-?%\}/g, '{# salla tag #}');
  try { Twig.twig({ data: src, rethrow: true, allowInlineIncludes: true }); }
  catch (e) {
    // twig.js lacks Twig 3 arrow functions, which Salla's engine supports.
    if (/=>/.test(e.message)) { console.warn(`~ ${file.replace(root + '/', '')}: arrow function (supported by Salla, skipped)`); continue; }
    bad++; console.error(`✗ ${file.replace(root + '/', '')}: ${e.message}`);
  }
}
console.log(bad ? `${bad} template(s) with errors` : 'all templates parse');
process.exit(bad ? 1 : 0);
