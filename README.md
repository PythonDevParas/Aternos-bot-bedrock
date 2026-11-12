# Aternos 24/7 Hosting Bot — Bedrock Edition

This is a Bedrock-focused rebuild of the supplied Java Edition bot. It uses
[`bedrock-protocol`](https://www.npmjs.com/package/bedrock-protocol), not Mineflayer.

## Features
- Bedrock protocol client (UDP; default port 19132)
- Automatic reconnect with exponential backoff
- Web dashboard, `/health`, and `/ping`
- Server chat logging
- Optional scheduled chat messages
- Environment-variable configuration for deployment

## Requirements
- Node.js 20+
- A Bedrock Edition server that permits the bot account to join
- A host that allows outbound UDP traffic to the Minecraft server

## Run locally
1. Extract the ZIP.
2. Install Node.js 20 or newer.
3. Edit `settings.json`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:5000`.

## Configure `settings.json`
- `bot-account.username`: GamerTag/profile name used by the client.
- `bot-account.offline`: `false` uses Xbox/Microsoft authentication; `true` disables Xbox auth and works only if the server accepts offline clients.
- `server.ip`: Bedrock server hostname.
- `server.port`: exact Bedrock port from the host panel. 19132 is only the common default; hosted servers can assign another port.
- `server.version`: leave empty for protocol discovery.
- `utils.auto-reconnect`: reconnect after disconnects.
- `utils.chat-messages`: optional periodic chat. Disabled by default.

Environment variables can override settings:
`BOT_USERNAME`, `BOT_OFFLINE`, `MC_SERVER_HOST`, `MC_SERVER_PORT`, `PORT`.

## Aternos notes
Use the Bedrock address and port shown in your Aternos server panel, not the Java address/port. Aternos can impose queue, start, inactivity, and access restrictions. This bot cannot guarantee that Aternos remains online or bypass those restrictions. Aternos must support external Bedrock clients for your server configuration.

## Scope / limitations
This is a protocol migration, not a feature-for-feature port. The original Java-only Mineflayer features (pathfinding, combat, bed placement/pickup, Java AuthMe automation, and Java plugin command handling) were removed because they do not directly work with Bedrock. The build focuses on a valid Bedrock connection, monitoring, reconnects and optional chat. Bedrock movement/AFK simulation is not included in this initial port.

## Troubleshooting
- `ECONNREFUSED` / timeout: verify the Bedrock host and assigned UDP port.
- Authentication failure: set `offline` to `false` and complete the Microsoft/Xbox sign-in flow, or use offline mode only on a server that explicitly permits it.
- Bot connects but is kicked: check allowlists, player limits, server version, and host rules.
- A cloud host cannot connect: verify it supports outbound UDP. Some serverless/web-only hosts do not.

Not affiliated with Mojang, Microsoft, or Aternos.
