class GameState {
  constructor(roomId, arena) {
    this.roomId = roomId;
    this.arena = arena;
    this.players = new Map();
    this.projectiles = new Map();
    this.tick = 0;
    this.tickRate = 50; // 20Hz
    this.roundTime = 600; // 10 minutes
    this.isRunning = false;

    // Arena spawn points
    this.spawns = this.getSpawnPoints(arena);
    this.spawnIndex = 0;
  }

  getSpawnPoints(arena) {
    // 16 spawn points per arena to support max capacity
    const spawns = {
      manhattan: [
        { lon: -73.984, lat: 40.753 },
        { lon: -73.982, lat: 40.751 },
        { lon: -73.986, lat: 40.755 },
        { lon: -73.980, lat: 40.754 },
        { lon: -73.985, lat: 40.750 },
        { lon: -73.988, lat: 40.752 },
        { lon: -73.981, lat: 40.756 },
        { lon: -73.983, lat: 40.748 },
        { lon: -73.987, lat: 40.749 },
        { lon: -73.979, lat: 40.752 },
        { lon: -73.984, lat: 40.757 },
        { lon: -73.986, lat: 40.747 },
        { lon: -73.978, lat: 40.750 },
        { lon: -73.989, lat: 40.754 },
        { lon: -73.982, lat: 40.747 },
        { lon: -73.985, lat: 40.758 }
      ],
      sf: [
        { lon: -122.400, lat: 37.792 },
        { lon: -122.398, lat: 37.790 },
        { lon: -122.402, lat: 37.794 },
        { lon: -122.396, lat: 37.793 },
        { lon: -122.401, lat: 37.788 },
        { lon: -122.404, lat: 37.790 },
        { lon: -122.397, lat: 37.795 },
        { lon: -122.399, lat: 37.787 },
        { lon: -122.403, lat: 37.791 },
        { lon: -122.395, lat: 37.789 },
        { lon: -122.400, lat: 37.796 },
        { lon: -122.398, lat: 37.786 },
        { lon: -122.405, lat: 37.793 },
        { lon: -122.394, lat: 37.791 },
        { lon: -122.401, lat: 37.797 },
        { lon: -122.397, lat: 37.785 }
      ],
      london: [
        { lon: -0.083, lat: 51.514 },
        { lon: -0.081, lat: 51.512 },
        { lon: -0.085, lat: 51.516 },
        { lon: -0.079, lat: 51.515 },
        { lon: -0.084, lat: 51.510 },
        { lon: -0.087, lat: 51.512 },
        { lon: -0.080, lat: 51.517 },
        { lon: -0.082, lat: 51.509 },
        { lon: -0.086, lat: 51.513 },
        { lon: -0.078, lat: 51.511 },
        { lon: -0.083, lat: 51.518 },
        { lon: -0.081, lat: 51.508 },
        { lon: -0.088, lat: 51.515 },
        { lon: -0.077, lat: 51.513 },
        { lon: -0.084, lat: 51.519 },
        { lon: -0.080, lat: 51.507 }
      ]
    };

    return spawns[arena] || spawns.manhattan;
  }

  addPlayer(playerData) {
    const spawn = this.spawns[this.spawnIndex % this.spawns.length];
    this.spawnIndex++;

    const player = {
      id: playerData.id,
      name: playerData.name,
      position: [spawn.lon, spawn.lat, 2], // lon, lat, height
      heading: 0,
      turretHeading: 0,
      turretPitch: 0,
      health: 100,
      maxHealth: 100,
      kills: 0,
      deaths: 0,
      isDead: false,
      input: {}
    };

    this.players.set(playerData.id, player);
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  getPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    return {
      id: player.id,
      name: player.name,
      position: player.position,
      heading: player.heading,
      turretHeading: player.turretHeading,
      health: player.health,
      isDead: player.isDead,
      kills: player.kills,
      deaths: player.deaths
    };
  }

  getPlayers() {
    return Array.from(this.players.values()).map(p => this.getPlayer(p.id));
  }

  updatePlayerInput(playerId, input, state) {
    const player = this.players.get(playerId);
    if (!player) return;

    player.input = input;

    // Update position from client state (with server validation)
    if (state && state.position) {
      player.position = state.position;
      player.heading = state.heading;
      player.turretHeading = state.turretHeading;
      player.turretPitch = state.turretPitch || 0;
    }
  }

  handleFire(playerId, projectileData) {
    const player = this.players.get(playerId);
    if (!player || player.isDead) return null;

    return {
      id: `proj_${Date.now()}_${Math.random()}`,
      ownerId: playerId,
      position: projectileData.position,
      direction: projectileData.direction,
      speed: projectileData.speed || 200,
      damage: projectileData.damage || 3
    };
  }

  handleHit(shooterId, targetId, position, damage) {
    const shooter = this.players.get(shooterId);
    const target = this.players.get(targetId);

    if (!target || target.isDead) return null;

    // Apply damage
    target.health -= damage;

    const result = {
      targetId: targetId,
      damage: damage,
      isKill: false
    };

    // Check for kill
    if (target.health <= 0) {
      target.health = 0;
      target.isDead = true;
      target.deaths++;

      if (shooter && shooter.id !== target.id) {
        shooter.kills++;
      }

      result.isKill = true;
      result.killerId = shooter ? shooter.id : target.id;
      result.killerName = shooter ? shooter.name : target.name;
      result.victimId = target.id;
      result.victimName = target.name;

      // Schedule respawn
      setTimeout(() => {
        this.respawnPlayer(targetId);
      }, 5000);
    }

    return result;
  }

  respawnPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    const spawn = this.spawns[this.spawnIndex % this.spawns.length];
    this.spawnIndex++;

    player.position = [spawn.lon, spawn.lat, 2];
    player.health = player.maxHealth;
    player.isDead = false;
    player.heading = 0;
    player.turretHeading = 0;
  }

  start(io) {
    this.isRunning = true;

    // Start game loop
    this.interval = setInterval(() => {
      this.update(io);
    }, this.tickRate);
  }

  stop() {
    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  update(io) {
    if (!this.isRunning) return;

    this.tick++;

    // Update round timer
    this.roundTime -= this.tickRate / 1000;

    // Broadcast state to all players in room
    const stateUpdate = {
      tick: this.tick,
      roundTime: this.roundTime,
      players: this.getPlayers().map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        heading: p.heading,
        turretHeading: p.turretHeading,
        health: p.health,
        isDead: p.isDead,
        kills: p.kills,
        deaths: p.deaths,
        isLocal: false // All players are "remote" from server perspective
      }))
    };

    io.to(this.roomId).emit('server-update', stateUpdate);

    // End round if time is up
    if (this.roundTime <= 0) {
      this.endRound(io);
    }
  }

  endRound(io) {
    // Send final scores
    const scores = this.getPlayers().map(p => ({
      id: p.id,
      name: p.name,
      kills: p.kills,
      deaths: p.deaths
    }));

    io.to(this.roomId).emit('round-ended', { scores });

    // Reset for new round
    this.roundTime = 600;
    this.players.forEach(player => {
      player.health = player.maxHealth;
      player.isDead = false;
      const spawn = this.spawns[this.spawnIndex % this.spawns.length];
      this.spawnIndex++;
      player.position = [spawn.lon, spawn.lat, 2];
    });
  }
}

export { GameState };
