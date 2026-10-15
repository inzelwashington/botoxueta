/* =====================================================================
   ЖИВОЙ ТЕСТ В БРАУЗЕРЕ через Chrome DevTools Protocol.
   Запускает headless Chrome, открывает игру, дёргает мини-игру и печатает
   реальные ошибки консоли и состояние страницы.

   Запуск: node tools/browser-check.mjs [url]
   ===================================================================== */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const URL_GAME = process.argv[2] || 'http://127.0.0.1:8777/';
const PORT = 9333;
const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome){
  console.error('Не найден Chrome/Edge');
  process.exit(2);
}

const userDir = path.join(os.tmpdir(), 'dsh-browser-check-' + Date.now());
fs.mkdirSync(userDir, { recursive: true });

console.log('Браузер:', chrome);
const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  'about:blank',
], { stdio: 'ignore', detached: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl(){
  for (let i = 0; i < 60; i++){
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch (_){}
    await sleep(250);
  }
  throw new Error('Chrome не отдал DevTools endpoint');
}

const wsUrl = await getWsUrl();
console.log('DevTools:', wsUrl);

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const consoleLogs = [];
const pageErrors = [];

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)){
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled'){
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    consoleLogs.push(msg.params.type + ': ' + text);
  }
  if (msg.method === 'Runtime.exceptionThrown'){
    const d = msg.params.exceptionDetails;
    pageErrors.push((d.exception && d.exception.description) || d.text || 'unknown');
  }
};
const send = (method, params = {}, sessionId) => new Promise((res) => {
  const id = ++msgId;
  pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

// берём вкладку
const { result: targets } = await send('Target.getTargets');
const page = targets.targetInfos.find((t) => t.type === 'page');
const { result: attach } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
const session = attach.sessionId;

await send('Runtime.enable', {}, session);
await send('Page.enable', {}, session);
await send('Log.enable', {}, session);
await send('Page.navigate', { url: URL_GAME }, session);
await sleep(2500);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, session);
  if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.text };
  if (r.result && r.result.result) return r.result.result.value;
  return undefined;
};

console.log('\n=== СОСТОЯНИЕ СТРАНИЦЫ ===');
console.log('title:', await ev('document.title'));
console.log('build (bagbier.build):', await ev('window.bagbier ? window.bagbier.build : "НЕТ window.bagbier"'));
console.log('script src:', await ev('[...document.querySelectorAll("script")].map(s=>s.getAttribute("src")).join(",")'));
console.log('меню открыто:', await ev('document.getElementById("screen").classList.contains("on")'));
console.log('элемент #mg существует:', await ev('!!document.getElementById("mg")'));
console.log('canvas clientWidth/Height:', await ev('(function(){const c=document.getElementById("mg-canvas");return c? c.clientWidth+"x"+c.clientHeight : "нет";})()'));

console.log('\n=== ЗАПУСК РЕЙСА ===');
console.log('нажимаю НАЧАТЬ РЕЙС:', await ev('(function(){const b=document.getElementById("go"); if(!b) return "нет кнопки"; b.click(); return "ок";})()'));
await sleep(1200);
console.log('событие:', await ev('window.bagbier ? window.bagbier.cardText() : "-"'));
console.log('вариантов выбора:', await ev('window.bagbier ? window.bagbier.choices().length : "-"'));
console.log('кнопок действий:', await ev('document.querySelectorAll("#actions .act").length'));

console.log('\n=== ЗАПУСК МИНИ-ИГРЫ НАПРЯМУЮ ===');
const startRes = await ev(`(function(){
  const g = document.getElementById('mg');
  const btn = [...document.querySelectorAll('#actions [data-act]')].find(b=>b.dataset.act==='shake');
  if (btn) btn.click();
  return { mgHidden: g.hidden, title: document.getElementById('mg-title').textContent };
})()`);
console.log('после клика по «тряхнуть»:', JSON.stringify(startRes));
await sleep(1500);

const state = await ev(`(function(){
  const g = document.getElementById('mg');
  const c = document.getElementById('mg-canvas');
  const ctx = c.getContext('2d');
  let nonBlack = 0;
  try {
    const d = ctx.getImageData(0, 0, Math.min(200, c.width), Math.min(200, c.height)).data;
    for (let i = 0; i < d.length; i += 4){ if (d[i] + d[i+1] + d[i+2] > 40) nonBlack++; }
  } catch(e){ nonBlack = 'ошибка: ' + e.message; }
  return {
    mgHidden: g.hidden,
    title: document.getElementById('mg-title').textContent,
    timer: document.getElementById('mg-timer').textContent,
    score: document.getElementById('mg-score').textContent,
    hint: document.getElementById('mg-hint').textContent.slice(0, 90),
    canvas: c.width + 'x' + c.height,
    cssSize: c.clientWidth + 'x' + c.clientHeight,
    nonBlackPixels: nonBlack,
    model: window.bagbier && window.bagbier.minigameModel ? (window.bagbier.minigameModel() ? window.bagbier.minigameModel().kind : null) : 'нет api',
  };
})()`);
console.log('состояние мини-игры:', JSON.stringify(state, null, 2));

console.log('\n=== ОШИБКИ СТРАНИЦЫ ===');
if (pageErrors.length) pageErrors.forEach((e) => console.log(' ✖ ' + e.split('\n')[0]));
else console.log(' нет');

console.log('\n=== КОНСОЛЬ ===');
consoleLogs.slice(-25).forEach((l) => console.log(' · ' + l.slice(0, 200)));

ws.close();
try { proc.kill(); } catch (_){}
await sleep(400);
process.exit(pageErrors.length ? 1 : 0);
