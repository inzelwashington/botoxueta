/* Статическая проверка: все селекторы '#id' и '.class' из JS существуют в HTML/CSS */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const jsFiles = ['src/main.js', 'src/render.js', 'src/minigames.js', 'src/audio.js', 'src/game.js'];

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
// id, которые main.js создаёт сам в шаблонах экранов (меню, финал)
const mainSrc = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const tmplIds = new Set([...mainSrc.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const known = (id) => htmlIds.has(id) || tmplIds.has(id);
const htmlClasses = new Set();
[...html.matchAll(/class="([^"]+)"/g)].forEach((m) => m[1].split(/\s+/).forEach((c) => c && htmlClasses.add(c)));
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

let problems = 0;
const seen = new Set();
for (const f of jsFiles){
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/\$\$?\('#([\w-]+)'\)/g)){
    if (!known(m[1])){ console.log(`!! ${f}: нет элемента #${m[1]} ни в index.html, ни в шаблонах экранов`); problems++; }
  }
  // классы, которые создаёт JS в разметке
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

// переменные CSS, которые использует JS
for (const m of css.matchAll(/--([\w-]+):/g)) { /* no-op */ }

// проверка, что все key() в ACTIONS уникальны
const gameSrc = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');
const keys = [...gameSrc.matchAll(/key: '(\w)'/g)].map((m) => m[1]);
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
if (dupes.length){ console.log('!! дублирующиеся горячие клавиши:', dupes); problems++; }
console.log('горячие клавиши действий:', keys.join(' '));

// проверка: каждый файл ассетов, который упоминает код, реально существует
const assetRefs = new Set();
for (const f of [...jsFiles, 'src/events.js']){
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  for (const m of src.matchAll(/['"](assets\/[\w.\-]+)['"]/g)) assetRefs.add(m[1]);
}
const missingAssets = [...assetRefs].filter((a) => !fs.existsSync(path.join(root, a)));
if (missingAssets.length){ console.log('!! файлов ассетов нет на диске:', missingAssets.join(', ')); problems++; }
console.log(`ассетов упомянуто в коде: ${assetRefs.size}, отсутствуют: ${missingAssets.length}`);

const unusedAssets = fs.readdirSync(path.join(root, 'assets'))
  .filter((f) => ![...assetRefs].some((r) => r.endsWith('/' + f)));
if (unusedAssets.length) console.log('?? лежат в assets/, но кодом не используются:', unusedAssets.join(', '));

console.log(problems ? `ПРОБЛЕМ: ${problems}` : 'селекторы и ассеты в порядке');
process.exit(problems ? 1 : 0);
