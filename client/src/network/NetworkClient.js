import { io } from 'socket.io-client';

/**
 * Network client for open-world multiplayer.
 * Connects to server app joins a persistent arena.
 * Falls back to solo mode if server unreachable.
 */
class NetworkClient {
  constructor(playerName, arena, game) {
    this.playerName = playerName;
    this.arena = arena;
    this.game = game;

    this.socket = null;
    this.connected = false;

    this.serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';

    // Client-side prediction
    this.pendingInputs = [];
    this.lastServerUpdate = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io(this.serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 5000,
          reconnectionAttempts: 3
        });

        this.socket.on('connect', () => {
          console.log('Connected to game server');
          this.connected = true;

          // Join the arena directly
          this.socket.emit('join-arena', {
            playerName: this.playerName,
            arena: this.arena
          });

          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('Server connection failed:', error.message);
          reject(error);
        });

        this.setupGameEventHandlers();
      } catch (e) {
        reject(e);
      }
    });
  }

  setupGameEventHandlers() {
    // Initial game state
    this.socket.on('game-state', (data) => {
      this.lastServerUpdate = data;
      this.handleInitialState(data);
    });

    // Player joined
    this.socket.on('player-joined-game', (data) => {
      if (this.game) this.game.onPlayerJoined(data.player);
    });

    // Player left
    this.socket.on('player-left-game', (data) => {
      if (this.game) this.game.onPlayerLeft(data.playerId);
    });

    // Player position update
    this.socket.on('player-update', (data) => {
      if (this.game) this.game.onPlayerUpdate(data);
    });

    // Projectile fired
    this.socket.on('projectile-fired', (data) => {
      if (this.game) this.game.onProjectileFired(data);
    });

    // Damage event
    this.socket.on('damage', (data) => {
      if (this.game) this.game.onDamage(data);
    });

    // Kill event
    this.socket.on('kill', (data) => {
      if (this.game) this.game.onKill(data);
    });

    // Server update tick
    this.socket.on('server-update', (data) => {
      this.handleServerUpdate(data);
    });
  }

  handleInitialState(data) {
    if (data.players) {
      data.players.forEach(player => {
        if (player.id !== this.socket.id) {
          this.game.onPlayerJoined(player);
        }
      });
    }
  }

  handleServerUpdate(data) {
    this.lastServerUpdate = data;

    if (data.players) {
      data.players.forEach(player => {
        if (player.id !== this.socket.id) {
          this.game.onPlayerUpdate(player);
        }
      });
    }
  }

  update(deltaTime) {
    if (!this.connected || !this.socket) return;

    const tank = this.game?.tank;
    if (tank) {
      const state = tank.serialize();

      this.socket.emit('player-input', {
        input: this.game?.inputManager?.getInput() || {},
        state: state,
        tick: Date.now()
      });
    }
  }

  sendFire(projectile) {
    if (!this.connected || !this.socket) return;

    this.socket.emit('fire-projectile', {
      projectile: {
        position: { x: projectile.position.x, y: projectile.position.y, z: projectile.position.z },
        direction: { x: projectile.direction.x, y: projectile.direction.y, z: projectile.direction.z },
        speed: projectile.speed,
        damage: projectile.damage
      }
    });
  }

  sendHit(data) {
    if (!this.connected || !this.socket) return;

    this.socket.emit('projectile-hit', {
      targetId: data.target,
      position: { x: data.position.x, y: data.position.y, z: data.position.z },
      damage: data.damage || 30
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }
}

export { NetworkClient };
