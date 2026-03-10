import express from 'express';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Server } from 'socket.io';
import { GameState } from './GameState.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const isDev = process.env.NODE_ENV !== 'production';

if (isDev) {
  app.get('/', (req, res) => {
    res.redirect('http://localhost:5173');
  });
} else {
  const distPath = join(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
}

const httpServer = createServer(app);

const allowedOrigins = isDev
  ? ['http://localhost:5173', 'http://localhost:5179', 'http://localhost:3000']
  : process.env.ALLOWED_ORIGINS?.split(',') || [];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// ─── Persistent Global Arenas ────────────────────────────────
// One GameState per arena, created on server start, lives forever.
const globalGames = new Map();

function getOrCreateArena(arenaId) {
  if (!globalGames.has(arenaId)) {
    console.log(`Creating persistent arena: ${arenaId}`);
    const gs = new GameState(arenaId, arenaId);
    gs.roundTime = Infinity; // No round timer for open world
    gs.start(io);
    globalGames.set(arenaId, gs);
  }
  return globalGames.get(arenaId);
}

// Pre-create all arenas
['manhattan', 'sf', 'london', 'void'].forEach(id => getOrCreateArena(id));

// ─── Connection Handler ──────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  let playerArena = null;

  // Player joins an arena
  socket.on('join-arena', ({ playerName, arena }) => {
    const arenaId = arena || 'manhattan';
    const gs = getOrCreateArena(arenaId);
    playerArena = arenaId;

    // Join the socket room for this arena
    socket.join(arenaId);

    // Add player to game state
    gs.addPlayer({ id: socket.id, name: playerName });

    // Send current game state to the new player
    socket.emit('game-state', {
      players: gs.getPlayers(),
      tick: gs.tick,
      arena: arenaId
    });

    // Notify others
    socket.to(arenaId).emit('player-joined-game', {
      player: gs.getPlayer(socket.id)
    });

    const playerCount = gs.players.size;
    console.log(`${playerName} joined ${arenaId} (${playerCount} players)`);
  });

  // Player input/state update
  socket.on('player-input', ({ input, state, tick }) => {
    if (!playerArena) return;
    const gs = globalGames.get(playerArena);
    if (gs) gs.updatePlayerInput(socket.id, input, state);
  });

  // Fire projectile
  socket.on('fire-projectile', ({ projectile }) => {
    if (!playerArena) return;
    const gs = globalGames.get(playerArena);
    if (gs) {
      const result = gs.handleFire(socket.id, projectile);
      if (result) {
        io.to(playerArena).emit('projectile-fired', result);
      }
    }
  });

  // Projectile hit
  socket.on('projectile-hit', ({ targetId, position, damage }) => {
    if (!playerArena) return;
    const gs = globalGames.get(playerArena);
    if (gs) {
      const result = gs.handleHit(socket.id, targetId, position, damage);
      if (result) {
        io.to(playerArena).emit('damage', result);
        if (result.isKill) {
          io.to(playerArena).emit('kill', {
            killerId: result.killerId,
            killerName: result.killerName,
            victimId: result.victimId,
            victimName: result.victimName
          });
        }
      }
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    if (playerArena) {
      const gs = globalGames.get(playerArena);
      if (gs) {
        gs.removePlayer(socket.id);
        io.to(playerArena).emit('player-left-game', { playerId: socket.id });
        console.log(`  Removed from ${playerArena} (${gs.players.size} players remain)`);
      }
    }
  });
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`Street Armor server running on port ${PORT}`);
  console.log(`Environment: ${isDev ? 'development' : 'production'}`);
  console.log(`Arenas: manhattan, sf, london (persistent)`);
  if (isDev) {
    console.log(`Server: http://localhost:${PORT}`);
  }
});
