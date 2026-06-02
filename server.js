// Quiz Night — Live buzzer server
// Auto-advancing multiple-choice quiz. Laptop shows the questions; phones buzz in via QR.
// No moderator needed: the server knows the answers and scores automatically.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// ---- timing (ms) ----
const OPEN_MS = 20000;   // time to buzz in on each question
const ANSWER_MS = 10000; // time for the buzzed-in player to pick an answer
const REVEAL_MS = 6000;  // time the answer + scores stay up before auto-advancing
const TICK_MS = 250;
const VALUE = 100;       // points for a correct answer (wrong = minus half)

// ---- question bank (multiple choice; `c` = index of correct option) ----
const QUESTIONS = [
  {cat:"Geography", q:"What is the capital of Canada?", o:["Toronto","Ottawa","Vancouver","Montreal"], c:1},
  {cat:"Science", q:"Which planet is the hottest in our solar system?", o:["Mercury","Venus","Mars","Jupiter"], c:1},
  {cat:"Geography", q:"How many continents are there on Earth?", o:["Five","Six","Seven","Eight"], c:2},
  {cat:"Animals", q:"What is the largest animal that has ever lived?", o:["African elephant","Blue whale","Giraffe","Argentinosaurus"], c:1},
  {cat:"Literature", q:"Who wrote the play 'Hamlet'?", o:["Charles Dickens","William Shakespeare","Leo Tolstoy","Jane Austen"], c:1},
  {cat:"Science", q:"What is the chemical symbol for gold?", o:["Go","Gd","Au","Ag"], c:2},
  {cat:"Animals", q:"What is the fastest land animal?", o:["Lion","Cheetah","Horse","Greyhound"], c:1},
  {cat:"General", q:"What is the currency of Japan?", o:["Won","Yuan","Yen","Ringgit"], c:2},
  {cat:"Maths", q:"How many sides does a hexagon have?", o:["Five","Six","Seven","Eight"], c:1},
  {cat:"Geography", q:"Which is the largest ocean on Earth?", o:["Atlantic","Indian","Arctic","Pacific"], c:3},
  {cat:"Art", q:"Who painted the Mona Lisa?", o:["Vincent van Gogh","Pablo Picasso","Leonardo da Vinci","Michelangelo"], c:2},
  {cat:"Geography", q:"What is the tallest mountain on Earth?", o:["K2","Mount Everest","Kilimanjaro","Denali"], c:1},
  {cat:"Science", q:"Which gas do plants absorb from the air?", o:["Oxygen","Nitrogen","Carbon dioxide","Hydrogen"], c:2},
  {cat:"History", q:"Who was the first person to walk on the Moon?", o:["Buzz Aldrin","Yuri Gagarin","Neil Armstrong","John Glenn"], c:2},
  {cat:"Sports", q:"How many players from one team are on a football (soccer) pitch?", o:["Nine","Ten","Eleven","Twelve"], c:2},
  {cat:"Science", q:"What is the hardest natural substance on Earth?", o:["Gold","Iron","Diamond","Quartz"], c:2},
  {cat:"Geography", q:"Which country has the largest population in the world?", o:["India","China","United States","Indonesia"], c:0},
  {cat:"Science", q:"The speed of light is roughly how many km per second?", o:["3,000","30,000","300,000","3,000,000"], c:2},
  {cat:"Science", q:"H₂O is the chemical formula for what?", o:["Salt","Water","Hydrogen peroxide","Ammonia"], c:1},
  {cat:"Space", q:"What is the largest planet in our solar system?", o:["Earth","Saturn","Jupiter","Neptune"], c:2},
  {cat:"Science", q:"Who developed the theory of general relativity?", o:["Isaac Newton","Albert Einstein","Nikola Tesla","Niels Bohr"], c:1},
  {cat:"Geography", q:"What is the capital of Australia?", o:["Sydney","Melbourne","Canberra","Perth"], c:2},
  {cat:"Science", q:"How many bones are in the adult human body?", o:["201","206","210","215"], c:1},
  {cat:"Language", q:"Which language has the most native speakers worldwide?", o:["English","Spanish","Mandarin Chinese","Hindi"], c:2},
  {cat:"Tech", q:"What does 'CPU' stand for?", o:["Central Processing Unit","Computer Power Unit","Central Program Utility","Core Processing Unit"], c:0},
  {cat:"History", q:"In which year did World War II end?", o:["1943","1945","1947","1950"], c:1},
  {cat:"Geography", q:"What is the smallest country in the world by area?", o:["Monaco","Nauru","Vatican City","Malta"], c:2},
  {cat:"General", q:"How many colours are traditionally in a rainbow?", o:["Five","Six","Seven","Eight"], c:2},
  {cat:"Food", q:"Which spice is the most expensive in the world by weight?", o:["Vanilla","Cardamom","Saffron","Cinnamon"], c:2},
  {cat:"Music", q:"How many keys does a standard piano have?", o:["76","82","88","92"], c:2},
];

// ---- game state ----
let nextId = 1;
const players = new Map();   // id -> {id, name, score, ws, connected}
const hosts = new Set();     // host websockets

const game = {
  phase: 'lobby',            // lobby | open | answering | reveal | gameover
  order: [],                 // shuffled indices into QUESTIONS
  qIndex: -1,
  activeBuzzer: null,        // player id currently answering
  lockedOut: new Set(),      // player ids that can't buzz this question
  winnerId: null,
  timerMs: 0,
  timerTotal: 0,
  openRemaining: OPEN_MS,    // remaining buzz-time, preserved across wrong answers
};

function shuffle(arr){
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function currentQ(){ return game.qIndex>=0 ? QUESTIONS[game.order[game.qIndex]] : null; }
function connectedPlayers(){ return [...players.values()].filter(p=>p.connected); }

// ---- phase transitions ----
function startGame(){
  if (game.phase!=='lobby' && game.phase!=='gameover') return;
  for (const p of players.values()) p.score = 0;
  game.order = shuffle([...QUESTIONS.keys()]);
  game.qIndex = -1;
  nextQuestion();
}
function nextQuestion(){
  game.qIndex++;
  if (game.qIndex >= game.order.length){ gameOver(); return; }
  game.phase = 'open';
  game.activeBuzzer = null;
  game.lockedOut = new Set();
  game.winnerId = null;
  game.openRemaining = OPEN_MS;
  setTimer(OPEN_MS);
  broadcast();
}
function gameOver(){
  game.phase = 'gameover';
  game.activeBuzzer = null;
  setTimer(0);
  broadcast();
}
function setTimer(ms){ game.timerMs = ms; game.timerTotal = ms; }

function buzz(id){
  if (game.phase!=='open') return;
  if (game.activeBuzzer!==null) return;
  if (game.lockedOut.has(id)) return;
  if (!players.has(id)) return;
  game.openRemaining = game.timerMs;     // remember remaining buzz time
  game.activeBuzzer = id;
  game.phase = 'answering';
  setTimer(ANSWER_MS);
  broadcast();
}
function answer(id, choice){
  if (game.phase!=='answering' || id!==game.activeBuzzer) return;
  const q = currentQ();
  const p = players.get(id);
  if (!p) return;
  if (choice === q.c){
    p.score += VALUE;
    game.winnerId = id;
    game.phase = 'reveal';
    setTimer(REVEAL_MS);
  } else {
    p.score -= Math.round(VALUE/2);
    game.lockedOut.add(id);
    game.activeBuzzer = null;
    if (connectedPlayers().every(pl => game.lockedOut.has(pl.id))){
      game.phase = 'reveal';            // everyone has missed it
      setTimer(REVEAL_MS);
    } else {
      game.phase = 'open';              // reopen for the others
      setTimer(game.openRemaining);
    }
  }
  broadcast();
}
function answerTimeout(){
  // buzzed-in player ran out of time: no penalty, just pass to the others
  game.lockedOut.add(game.activeBuzzer);
  game.activeBuzzer = null;
  if (connectedPlayers().every(pl => game.lockedOut.has(pl.id))){
    game.phase = 'reveal';
    setTimer(REVEAL_MS);
  } else {
    game.phase = 'open';
    setTimer(game.openRemaining);
  }
  broadcast();
}

// ---- main tick ----
setInterval(() => {
  if (game.phase==='lobby' || game.phase==='gameover') return;
  game.timerMs -= TICK_MS;
  if (game.timerMs > 0){ broadcast(); return; }
  if (game.phase==='open'){ game.phase='reveal'; setTimer(REVEAL_MS); broadcast(); }
  else if (game.phase==='answering'){ answerTimeout(); }
  else if (game.phase==='reveal'){ nextQuestion(); }
}, TICK_MS);

// ---- networking ----
function send(ws, obj){ if (ws.readyState===1) ws.send(JSON.stringify(obj)); }

function playerList(){
  return [...players.values()]
    .map(p=>({id:p.id, name:p.name, score:p.score, connected:p.connected}))
    .sort((a,b)=>b.score-a.score);
}

function stateMsg(){
  const q = currentQ();
  const s = {
    type:'state',
    phase: game.phase,
    qNumber: game.qIndex+1,
    qTotal: game.order.length,
    players: playerList(),
    timerMs: Math.max(0, game.timerMs),
    timerTotal: game.timerTotal,
    value: VALUE,
  };
  if (game.phase==='open' || game.phase==='answering' || game.phase==='reveal'){
    if (q){ s.category=q.cat; s.question=q.q; s.options=q.o; }
    s.activeBuzzer = game.activeBuzzer;
    const ap = game.activeBuzzer!=null ? players.get(game.activeBuzzer) : null;
    s.activeBuzzerName = ap ? ap.name : null;
    s.lockedOut = [...game.lockedOut];
  }
  if (game.phase==='reveal' && q){ s.correct = q.c; s.winnerId = game.winnerId; }
  return s;
}

let lobbyInfo = { playURL:'', qrDataUrl:'' };
function broadcast(){
  const base = stateMsg();
  for (const ws of hosts){
    send(ws, {...base, isHost:true, playURL:lobbyInfo.playURL, qrDataUrl:lobbyInfo.qrDataUrl});
  }
  for (const p of players.values()){
    if (p.connected) send(p.ws, {...base, isHost:false, you:p.id});
  }
}

// ---- static file server ----
const FILES = {
  '/host': ['host.html','text/html'],
  '/play': ['play.html','text/html'],
};
const server = http.createServer((req,res)=>{
  const url = req.url.split('?')[0];
  if (url==='/' ){ res.writeHead(302,{Location:'/host'}); res.end(); return; }
  const entry = FILES[url];
  if (entry){
    fs.readFile(path.join(__dirname,'public',entry[0]),(err,data)=>{
      if (err){ res.writeHead(500); res.end('error'); return; }
      res.writeHead(200,{'Content-Type':entry[1]}); res.end(data);
    });
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws)=>{
  ws.meta = { role:null, id:null };
  ws.on('message', (raw)=>{
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type==='join'){
      if (m.role==='host'){
        ws.meta.role='host'; hosts.add(ws);
        send(ws, {...stateMsg(), isHost:true, playURL:lobbyInfo.playURL, qrDataUrl:lobbyInfo.qrDataUrl});
      } else {
        const name = (m.name||'Player').toString().slice(0,18).trim() || 'Player';
        const id = nextId++;
        players.set(id, {id, name, score:0, ws, connected:true});
        ws.meta.role='player'; ws.meta.id=id;
        send(ws, {type:'joined', id, name});
        broadcast();
      }
    } else if (m.type==='start'){ startGame(); }
    else if (m.type==='buzz'){ if (ws.meta.id) buzz(ws.meta.id); }
    else if (m.type==='answer'){ if (ws.meta.id) answer(ws.meta.id, m.choice); }
    else if (m.type==='restart'){ game.phase='lobby'; broadcast(); }
  });
  ws.on('close', ()=>{
    if (ws.meta.role==='host') hosts.delete(ws);
    if (ws.meta.role==='player' && ws.meta.id && players.has(ws.meta.id)){
      players.get(ws.meta.id).connected = false;
      broadcast();
    }
  });
});

// ---- find LAN IP, build QR, start ----
function lanIP(){
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)){
    for (const net of nets[name]){
      if (net.family==='IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const ip = lanIP();
lobbyInfo.playURL = `http://${ip}:${PORT}/play`;
QRCode.toDataURL(lobbyInfo.playURL, {margin:1, width:320}, (err,url)=>{
  if (!err) lobbyInfo.qrDataUrl = url;
  server.listen(PORT, ()=>{
    console.log('\n  🎉  Quiz Night — Live is running!\n');
    console.log('  ┌─────────────────────────────────────────────┐');
    console.log(`  │  Big screen (this laptop):  http://localhost:${PORT}/host`);
    console.log(`  │  Players join on phones:    ${lobbyInfo.playURL}`);
    console.log('  └─────────────────────────────────────────────┘');
    console.log('\n  Open the big-screen link here, then have everyone');
    console.log('  scan the QR code on screen with their phone camera.');
    console.log('  (Everyone must be on the same Wi-Fi.)  Ctrl+C to stop.\n');
  });
});
