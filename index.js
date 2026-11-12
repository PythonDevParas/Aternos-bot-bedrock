'use strict';

const bedrock = require('bedrock-protocol');
const express = require('express');
const config = require('./settings.json');

const app = express();
const PORT = Number(process.env.PORT || config.dashboard?.port || 5000);

let client = null;
let reconnectTimer = null;
let chatTimer = null;
let shuttingDown = false;
let reconnectAttempts = 0;
const state = {
  status: 'starting',
  connectedAt: null,
  startedAt: Date.now(),
  lastError: null,
  lastDisconnect: null,
  username: config['bot-account'].username,
  server: `${config.server.ip}:${config.server.port}`
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function uptimeSeconds() {
  return state.connectedAt ? Math.floor((Date.now() - state.connectedAt) / 1000) : 0;
}
function clearChatTimer() {
  if (chatTimer) clearInterval(chatTimer);
  chatTimer = null;
}
function scheduleReconnect() {
  if (shuttingDown || reconnectTimer || config.utils?.['auto-reconnect'] === false) return;
  reconnectAttempts += 1;
  const base = Number(config.utils?.['auto-reconnect-delay'] || 5000);
  const max = Number(config.utils?.['max-reconnect-delay'] || 120000);
  const delay = Math.min(base * (2 ** Math.min(reconnectAttempts - 1, 8)), max);
  state.status = 'reconnecting';
  log(`[Reconnect] Attempt ${reconnectAttempts} in ${Math.round(delay / 1000)}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBot();
  }, delay);
}
function sendChat(message) {
  if (!client || state.status !== 'connected') return false;
  try {
    client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: client.username || state.username,
      xuid: '',
      platform_chat_id: '',
      filtered_message: '',
      message: String(message).slice(0, 256)
    });
    return true;
  } catch (err) {
    state.lastError = err.message;
    log('[Chat] Failed:', err.message);
    return false;
  }
}
function startChatMessages() {
  clearChatTimer();
  const options = config.utils?.['chat-messages'];
  if (!options?.enabled || !Array.isArray(options.messages) || options.messages.length === 0) return;
  let index = 0;
  const sendNext = () => {
    if (state.status !== 'connected') return;
    const message = options.messages[index % options.messages.length];
    if (message) sendChat(message);
    index += 1;
  };
  sendNext();
  if (options.repeat) {
    chatTimer = setInterval(sendNext, Math.max(30, Number(options['repeat-delay'] || 120)) * 1000);
  }
}
function closeCurrentClient() {
  clearChatTimer();
  if (!client) return;
  const old = client;
  client = null;
  try { old.removeAllListeners(); old.close(); } catch (_) {}
}
function connectBot() {
  if (shuttingDown) return;
  closeCurrentClient();

  const username = process.env.BOT_USERNAME || config['bot-account'].username;
  const host = process.env.MC_SERVER_HOST || config.server.ip;
  const port = Number(process.env.MC_SERVER_PORT || config.server.port || 19132);
  const offline = String(process.env.BOT_OFFLINE ?? config['bot-account'].offline) === 'true';

  if (!host || host === 'your-bedrock-server.aternos.me' || !username || username.startsWith('Your')) {
    state.status = 'configuration required';
    log('[Config] Set bot-account.username and server.ip in settings.json, or use environment variables.');
    return;
  }

  state.status = 'connecting';
  state.server = `${host}:${port}`;
  state.username = username;
  log(`[Bedrock] Connecting to ${host}:${port} as ${username} (offline=${offline})`);

  try {
    client = bedrock.createClient({
      host,
      port,
      username,
      offline,
      ...(config.server.version ? { version: config.server.version } : {})
    });

    client.on('join', () => log('[Bedrock] Joined server handshake.'));
    client.on('spawn', () => {
      state.status = 'connected';
      state.connectedAt = Date.now();
      state.lastError = null;
      reconnectAttempts = 0;
      log(`[Bedrock] Spawned in world as ${username}.`);
      startChatMessages();
    });

    client.on('text', packet => {
      if (config.utils?.['chat-log'] !== false) {
        const line = `${packet.source_name || 'Server'}: ${packet.message || ''}`;
        log('[Server chat]', line);
      }
    });

    client.on('kick', reason => {
      state.lastDisconnect = String(reason?.message || reason || 'Kicked by server');
      log('[Bedrock] Kicked:', state.lastDisconnect);
      state.status = 'disconnected';
      state.connectedAt = null;
    });
    client.on('close', () => {
      log('[Bedrock] Connection closed.');
      state.status = 'disconnected';
      state.connectedAt = null;
      clearChatTimer();
      scheduleReconnect();
    });
    client.on('error', err => {
      state.lastError = err.message || String(err);
      log('[Bedrock] Error:', state.lastError);
    });
  } catch (err) {
    state.lastError = err.message;
    state.status = 'error';
    log('[Bedrock] Could not create client:', err.message);
    scheduleReconnect();
  }
}

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(config.name)} Dashboard</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#08111f;color:#e5edf7;font-family:Inter,Segoe UI,Arial,sans-serif;display:grid;place-items:center;padding:24px}
main{width:min(100%,620px);background:#111d30;border:1px solid #263750;border-radius:22px;padding:28px;box-shadow:0 24px 80px #0008}
h1{margin:0 0 8px;font-size:26px}p{color:#9fb0c6}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:24px 0}
.card{background:#0b1728;border:1px solid #25364e;border-radius:14px;padding:16px}.label{font-size:11px;color:#8da2bd;text-transform:uppercase;letter-spacing:1px}.value{font-size:17px;font-weight:700;margin-top:8px;overflow-wrap:anywhere}
#status{color:#fbbf24}.links{display:flex;gap:12px;flex-wrap:wrap}a{color:#67e8f9;text-decoration:none}small{color:#8294aa}
@media(max-width:480px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>${escapeHtml(config.name)}</h1><p> Minecraft Bedrock Edition connection monitor</p>
<div class="grid">
<div class="card"><div class="label">Status</div><div class="value" id="status">${escapeHtml(state.status)}</div></div>
<div class="card"><div class="label">Connected uptime</div><div class="value" id="uptime">0h 0m 0s</div></div>
<div class="card"><div class="label">Bot name</div><div class="value" id="username">${escapeHtml(state.username)}</div></div>
<div class="card"><div class="label">Bedrock server</div><div class="value" id="server">${escapeHtml(state.server)}</div></div>
<div class="card"><div class="label">Reconnect attempts</div><div class="value" id="attempts">0</div></div>
<div class="card"><div class="label">Last error</div><div class="value" id="error">None</div></div>
</div><div class="links"><a href="/health">Health JSON</a><a href="/tutorial">Setup guide</a><a href="/ping">Ping</a></div>
<p><small>Refreshes automatically every 5 seconds.</small></p>
</main><script>
async function update(){try{const r=await fetch('/health');const d=await r.json();
document.getElementById('status').textContent=d.status;
document.getElementById('uptime').textContent=d.uptimeFormatted;
document.getElementById('username').textContent=d.username;
document.getElementById('server').textContent=d.server;
document.getElementById('attempts').textContent=d.reconnectAttempts;
document.getElementById('error').textContent=d.lastError||'None';
}catch(e){document.getElementById('status').textContent='Dashboard error'}}
update();setInterval(update,5000);
</script></body></html>`);
});
app.get('/health', (_req, res) => {
  const s = uptimeSeconds();
  res.json({
    status: state.status,
    uptime: s,
    uptimeFormatted: `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`,
    totalProcessUptime: Math.floor((Date.now() - state.startedAt) / 1000),
    username: state.username,
    server: state.server,
    reconnectAttempts,
    lastError: state.lastError,
    lastDisconnect: state.lastDisconnect
  });
});
app.get('/ping', (_req, res) => res.send('pong'));
app.get('/tutorial', (_req, res) => res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Bedrock Bot Setup</title><body style="font:16px Segoe UI,Arial;background:#08111f;color:#e5edf7;max-width:850px;margin:40px auto;padding:20px;line-height:1.6">
<h1>Bedrock Edition setup</h1><ol>
<li>Use a Minecraft Bedrock Dedicated Server or a Bedrock-compatible hosted server.</li>
<li>Copy the Bedrock server address and UDP port from your host. The common default is <code>19132</code>; Aternos may show a different port.</li>
<li>Edit <code>settings.json</code>: set the bot username, <code>offline</code> mode, server IP and exact port.</li>
<li>For Xbox-authenticated servers, set <code>offline</code> to <code>false</code> and follow the authentication flow shown in the terminal. Offline mode works only if the server accepts unauthenticated clients.</li>
<li>Run <code>npm install</code>, then <code>npm start</code>.</li>
<li>Open the dashboard at <code>http://localhost:5000</code>.</li>
</ol>
<p><b>Important:</b> Aternos may stop servers based on its own policies. A bot cannot guarantee 24/7 uptime or bypass host inactivity restrictions. Keep use within the host's rules.</p>
<p>This build provides connection monitoring, reconnect handling and optional chat messages. It does not include the original Java-only Mineflayer pathfinding, combat, bed handling or Java plugin commands.</p><p><a href="/">Back to dashboard</a></p></body>`));

const webServer = app.listen(PORT, '0.0.0.0', () => log(`[Web] Dashboard listening on port ${PORT}`));
webServer.on('error', err => log('[Web] Server error:', err.message));

connectBot();

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('[System] Shutting down...');
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearChatTimer();
  closeCurrentClient();
  webServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
