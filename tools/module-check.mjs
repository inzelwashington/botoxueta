/* Проверка, что каждый модуль игры грузится в чистом Node (без DOM-заглушек)
   и не падает на этапе загрузки. Запуск: node tools/module-check.mjs */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = process.cwd();
const mods = ['audio.js', 'events.js', 'narration.js', 'game.js', 'render.js', 'minigames.js'];
let bad = 0;
for (const m of mods){
  try {
    await import(pathToFileURL(path.join(root, 'src', m)).href);
    console.log('  ✓ src/' + m + ' загружается');
  } catch (e){
    console.log('  ✖ src/' + m + ' ПАДАЕТ: ' + e.message);
    bad++;
  }
}
console.log(bad ? `ПРОБЛЕМ: ${bad}` : 'все модули (кроме main.js, которому нужен DOM) грузятся');
process.exit(bad ? 1 : 0);
