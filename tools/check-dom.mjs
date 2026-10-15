/* Статическая проверка: селекторы '#id' из JS есть в HTML,
   а все ассеты, упомянутые в JS и CSS, реально лежат на диске.
   Запуск: node tools/check-dom.mjs */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const jsFiles = ['src/main.js', 'src/render.js', 'src/minigames.js', 'src/audio.js', 'src/game.js', 'src/narration.js'];

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const htmlClasses = new Set();
[...html.matchAll(/class="([^"]+)"/g)].forEach((m) => m[1].split(/\s+/).forEach((c) => c && htmlClasses.add(c)));
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

// id, которые main.js создаёт сам в шаблонах экранов (меню, финал)
const mainSrc = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const tmplIds = new Set([...mainSrc.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const known = (id) => htmlIds.has(id) || tmplIds.has(id);

let problems = 0;
const seen = new Set();
for (const f of jsFiles){
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/\$\$?\('#([\w-]+)'\)/g)){
    if (!known(m[1])){ console.log(`!! ${f}: нет элемента #${m[1]} ни в index.html, ни в шаблонах экранов`); problems++; }
  }
  for (const m of src.matchAll(/class="([^"$]*?)"/g)){
    for (const c of m[1].split(/\s+/).filter(Boolean)){
      if (c.includes('$')) continue;
      if (!cssClasses.has(c) && !htmlClasses.has(c)){
        const key = f + c;
        if (!seen.has(key)){ seen.add(key); console.log(`?? ${f}: класс .${c} нигде не описан (не критично)`); }
      }
    }
  }
}

// --- ассеты: всё, что упомянуто в JS и CSS, должно существовать ---
const assetRefs = new Set();
for (const f of [...jsFiles, 'src/events.js']){
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/['"](assets\/[\w.\-/]+)['"]/g)) assetRefs.add(m[1]);
}
for (const m of css.matchAll(/url\('([^']+)'\)/g)){
  if (m[1].startsWith('assets/')) assetRefs.add(m[1]);
}
const missingAssets = [...assetRefs].filter((a) => !fs.existsSync(path.join(root, a)));
if (missingAssets.length){ console.log('!! файлов ассетов нет на диске:', missingAssets.join(', ')); problems++; }

const allFiles = fs.readdirSync(path.join(root, 'assets'), { recursive: true })
  .map((f) => String(f).replace(/\\/g, '/'))
  .filter((f) => fs.statSync(path.join(root, 'assets', f)).isFile());
const unusedAssets = allFiles.filter((f) => !assetRefs.has('assets/' + f));
if (unusedAssets.length) console.log('?? лежат в assets/, но кодом не используются:', unusedAssets.join(', '));
else console.log('все файлы из assets/ задействованы');

// --- горячие клавиши действий уникальны ---
const keys = [...fs.readFileSync(path.join(root, 'src/game.js'), 'utf8').matchAll(/key: '(\w)'/g)].map((m) => m[1]);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dupes.length){ console.log('!! дублирующиеся горячие клавиши:', dupes); problems++; }

/* --- раскладка: проверяем CSS статически ---
   Тесты на DOM-заглушках не разбирают CSS, поэтому сломанная вёрстка
   (обрезанные кнопки выбора, вечно висящее окно мини-игры) ими не ловится. */
const layoutChecks = [
  ['#app — flex-столбец', /#app\{[^}]*display:flex[^}]*flex-direction:column/, 'раскладка должна быть предсказуемой'],
  ['#story — явная высота', /#story\{[^}]*height:\s*[\d.]+vh/, 'иначе история может схлопнуться или обрезать кнопки'],
  ['#story — скролл внутри себя', /#story\{[^}]*overflow-y:auto/, 'иначе варианты выбора уезжают за границу'],
  ['.mg — модальное окно', /\.mg\{[^}]*position:fixed/, 'окно мини-игры должно быть поверх всего'],
  ['.mg[hidden] скрыт', /\.mg\[hidden\]\{display:none !important\}/, 'иначе окно мини-игры висит всегда'],
  ['#mg-canvas — фиксированная высота', /#mg-canvas\{[^}]*height:/, 'иначе холст схлопывается в ноль'],
];
for (const [name, re, why] of layoutChecks){
  if (!re.test(css)){ console.log(`!! раскладка: ${name} — ${why}`); problems++; }
}
if (/#app\{[^}]*grid-template-rows/.test(css)){
  console.log('!! раскладка: у #app остались grid-template-rows (источник обрезаний)');
  problems++;
}
console.log('раскладка: проверено правил — ' + layoutChecks.length);

/* --- hidden обязан побеждать авторский display ---
   Иначе окно мини-игры (display:flex/grid) висит на экране с самого старта. */
if (!/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(css)){
  console.log('!! в styles.css нет правила [hidden]{display:none !important} — окна не будут скрываться');
  problems++;
} else {
  console.log('правило [hidden] на месте — оверлеи скрываются корректно');
}

console.log('горячие клавиши действий:', keys.join(' '));
console.log(`ассетов упомянуто: ${assetRefs.size}, на диске: ${allFiles.length}, отсутствуют: ${missingAssets.length}`);
console.log(problems ? `ПРОБЛЕМ: ${problems}` : 'селекторы и ассеты в порядке');
process.exit(problems ? 1 : 0);
