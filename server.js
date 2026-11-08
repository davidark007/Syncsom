// SyncSom - servidor de sincronizacao de audio entre varios aparelhos no mesmo Wi-Fi.
// O servidor guarda UM estado de reproducao (musica, tocando/pausado, ponto de ancora no tempo)
// e todos os aparelhos calculam a posicao da musica a partir dele, usando um relogio comum.

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const UPLOADS = path.join(__dirname, 'uploads');
const LEAD_MS = 600; // antecedencia para play/seek: da tempo de a mensagem chegar em todos
const LEAD_LOAD_MS = 1500; // antecedencia ao trocar de musica: da tempo de baixar o arquivo
const MAX_UPLOAD = '100mb';
const ALLOWED = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.flac', '.weba', '.webm']);

// Recomeca limpo a cada execucao (as musicas enviadas ficam so enquanto o servidor estiver ligado).
fs.rmSync(UPLOADS, { recursive: true, force: true });
fs.mkdirSync(UPLOADS, { recursive: true });

const tracks = []; // { id, name, file }
const state = { trackId: null, status: 'paused', anchorTime: 0, anchorPos: 0 };
// Tocando: posicao agora = anchorPos + (agora - anchorTime) / 1000 (anchorTime pode estar no futuro).
// Pausado: posicao = anchorPos.

const currentPos = () =>
  state.status === 'playing'
    ? state.anchorPos + Math.max(0, (Date.now() - state.anchorTime) / 1000)
    : state.anchorPos;

function startAt(pos, lead) {
  state.status = 'playing';
  state.anchorPos = Math.max(0, pos);
  state.anchorTime = Date.now() + lead;
}

function selectTrack(id) {
  if (!tracks.some((t) => t.id === id)) return;
  state.trackId = id;
  startAt(0, LEAD_LOAD_MS);
}

function handle(msg) {
  switch (msg.type) {
    case 'play':
      if (!state.trackId) return;
      if (state.status !== 'playing') startAt(state.anchorPos, LEAD_MS);
      break;
    case 'pause':
      if (state.status === 'playing') {
        state.anchorPos = currentPos();
        state.status = 'paused';
      }
      break;
    case 'seek':
      if (!state.trackId || typeof msg.pos !== 'number' || !isFinite(msg.pos)) return;
      if (state.status === 'playing') startAt(msg.pos, LEAD_MS);
      else state.anchorPos = Math.max(0, msg.pos);
      break;
    case 'select':
      selectTrack(msg.trackId);
      break;
    case 'next': {
      const i = tracks.findIndex((t) => t.id === state.trackId);
      if (i >= 0 && i < tracks.length - 1) selectTrack(tracks[i + 1].id);
      break;
    }
    case 'prev': {
      const i = tracks.findIndex((t) => t.id === state.trackId);
      if (i < 0) return;
      if (currentPos() > 3 || i === 0) {
        if (state.status === 'playing') startAt(0, LEAD_MS);
        else state.anchorPos = 0;
      } else {
        selectTrack(tracks[i - 1].id);
      }
      break;
    }
    case 'ended': {
      // Varios aparelhos avisam; so o primeiro vale (os outros chegam com trackId/status desatualizado).
      if (msg.trackId !== state.trackId || state.status !== 'playing') return;
      const i = tracks.findIndex((t) => t.id === state.trackId);
      if (i >= 0 && i < tracks.length - 1) {
        selectTrack(tracks[i + 1].id);
      } else {
        state.status = 'paused';
        state.anchorPos = 0;
      }
      break;
    }
  }
}

const app = express();
app.disable('x-powered-by');

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Os arquivos de audio sao servidos com suporte a "Range", necessario para pular no meio da musica.
app.use('/audio', express.static(UPLOADS, { acceptRanges: true, fallthrough: false }));

app.get('/info', (req, res) => {
  res.json({ urls: lanUrls() });
});

app.post('/upload', express.raw({ type: () => true, limit: MAX_UPLOAD }), (req, res) => {
  const original = String(req.query.name || 'musica');
  const ext = path.extname(original).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return res.status(400).json({ error: 'Formato nao suportado. Use MP3, M4A, WAV, OGG, FLAC...' });
  }
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Arquivo vazio' });
  }
  const id = crypto.randomBytes(6).toString('hex');
  const file = id + ext;
  fs.writeFileSync(path.join(UPLOADS, file), req.body);
  const track = { id, name: path.basename(original, path.extname(original)).slice(0, 120), file };
  tracks.push(track);
  if (!state.trackId) state.trackId = id; // primeira musica ja fica selecionada (pausada)
  broadcast();
  res.json(track);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const tooLarge = err && err.type === 'entity.too.large';
  res
    .status(tooLarge ? 413 : err.status || 500)
    .json({ error: tooLarge ? 'Arquivo grande demais (maximo 100 MB)' : 'Erro no servidor' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function snapshot() {
  return JSON.stringify({
    type: 'state',
    tracks,
    state,
    clients: wss.clients.size,
    serverNow: Date.now(),
  });
}

function broadcast() {
  const msg = snapshot();
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
}

wss.on('connection', (ws) => {
  broadcast(); // atualiza a contagem de aparelhos para todos (inclui o novo)
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'ping') {
      // Troca de mensagens para cada aparelho descobrir a diferenca entre o relogio dele e o do servidor.
      ws.send(JSON.stringify({ type: 'pong', t0: msg.t0, ts: Date.now() }));
      return;
    }
    handle(msg);
    broadcast();
  });
  ws.on('close', broadcast);
});

function lanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) urls.push(`http://${i.address}:${PORT}`);
    }
  }
  return urls;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('\nSyncSom rodando!');
  console.log('Abra um destes enderecos em cada aparelho (todos no mesmo Wi-Fi):\n');
  const urls = lanUrls();
  if (urls.length === 0) console.log(`  http://localhost:${PORT}`);
  for (const u of urls) console.log('  ' + u);
  console.log('');
});
