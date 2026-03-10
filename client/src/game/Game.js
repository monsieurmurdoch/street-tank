import { Tank } from './Tank.js';
import { InputManager } from './InputManager.js';
import { CameraController } from './CameraController.js';
import { ProjectileManager } from './ProjectileManager.js';
import { BuildingCollider } from '../collision/BuildingCollider.js';
import { GroundClamper } from '../collision/GroundClamper.js';
import { NetworkClient } from '../network/NetworkClient.js';
import { HUD } from '../ui/HUD.js';
import { Minimap } from '../ui/Minimap.js';
import { Scoreboard } from '../ui/Scoreboard.js';

class Game {
  constructor(container, apiKey) {
    this.container = container;
    this.apiKey = apiKey;
    this.viewer = null;
    this.scene = null;
    this.tileset = null;  // Reference to Google 3D Tiles tileset

    // Game state
    this.isRunning = false;
    this.lastTime = 0;
    this.soloMode = false;

    // Systems
    this.tank = null;
    this.inputManager = null;
    this.cameraController = null;
    this.projectileManager = null;
    this.buildingCollider = null;
    this.groundClamper = null;
    this.network = null;
    this.hud = null;
    this.minimap = null;
    this.scoreboard = null;

    // Other tanks (remote players)
    this.remoteTanks = new Map();

    // Arena data
    this.arena = null;
  }

  async init(roomId, playerName, arenaId) {
    this.soloMode = !roomId; // will be overridden by network connect attempt

    try {
      // Initialize CesiumJS viewer
      await this.initViewer();

      // Load arena data
      await this.loadArena(arenaId);

      // Initialize ground clamper with arena's ground level (fallback)
      this.groundClamper = new GroundClamper(this.viewer, this.arena.groundLevel);

      // Initialize building collider
      this.buildingCollider = new BuildingCollider(this.arena);

      // Initialize input manager
      this.inputManager = new InputManager();

      // Pick a random spawn point
      const spawnIndex = Math.floor(Math.random() * this.arena.spawns.length);
      const spawnPoint = this.arena.spawns[spawnIndex];

      // Fly camera to the spawn area and wait for terrain + tiles to preload
      this.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
          spawnPoint.lon, spawnPoint.lat, 100
        ),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        }
      });

      // Wait for 3D tiles to be ready before sampling height
      if (this.tileset) {
        try {
          // Wait for the tileset to finish initial loading
          await this.tileset.readyPromise;
          console.log('3D Tiles tileset ready');
        } catch (e) {
          console.warn('Tileset readyPromise failed:', e.message);
        }
      }

      // Give tiles additional time to load geometry at this location
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Find the terrain (street-level) height with retries
      let groundHeight = this.arena.groundLevel || 5;
      const maxRetries = 5;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const sampledHeight = await this.groundClamper.findInitialGroundLevel(spawnPoint.lon, spawnPoint.lat);
        if (sampledHeight !== this.arena.groundLevel && sampledHeight > 0) {
          groundHeight = sampledHeight;
          console.log(`Height sampling succeeded on attempt ${attempt + 1}: ${groundHeight.toFixed(2)}m`);
          break;
        }
        console.log(`Height sampling attempt ${attempt + 1} fell back to default, retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      console.log('Final terrain ground level:', groundHeight);

      // Create tank at the correct street-level height + baseHeight so it sits ON the surface
      const spawnHeight = groundHeight + this.groundClamper.baseHeight;
      const tankPosition = Cesium.Cartesian3.fromDegrees(
        spawnPoint.lon,
        spawnPoint.lat,
        spawnHeight
      );

      this.tank = new Tank(this.viewer, {
        position: tankPosition,
        isLocal: true,
        name: playerName
      });
      await this.tank.init();

      // Exclude tank from ground clamping so we don't clamp to ourselves
      if (this.tank.hullEntity && this.groundClamper.setExcludeEntities) {
        this.groundClamper.setExcludeEntities([
          this.tank.hullEntity
        ]);
      }

      // Initialize camera
      this.cameraController = new CameraController(this.viewer, this.tank);

      // Initialize projectile manager
      this.projectileManager = new ProjectileManager(
        this.viewer,
        this.buildingCollider,
        this.groundClamper
      );

      // Always try to connect to server (open world)
      try {
        this.network = new NetworkClient(playerName, arenaId, this);
        await this.network.connect();
        this.soloMode = false;
      } catch (err) {
        console.warn('Server unavailable, running solo:', err.message);
        this.network = null;
        this.soloMode = true;
      }

      // Update player count display
      const countEl = document.getElementById('player-count');
      if (countEl) countEl.textContent = this.soloMode ? 'Solo' : 'Online';

      // Initialize UI
      this.hud = new HUD(this.tank);
      this.minimap = new Minimap(this.arena);
      this.scoreboard = new Scoreboard();

      // Cache crosshair element for mouse-following
      this.crosshairEl = document.querySelector('.crosshair');

      // Setup event handlers
      this.setupEventHandlers();

      // Start game loop
      this.start();

      console.log('Game initialized' + (this.soloMode ? ' (solo mode)' : ` (online - ${arenaId})`));

    } catch (error) {
      console.error('Game initialization error:', error);
      throw error;
    }
  }

  async initViewer() {
    // Do NOT set Cesium.Ion.defaultAccessToken to the Google API key.
    // They are different credentials. Leave Ion token unset — we load
    // Google 3D Tiles via direct URL and use ArcGIS imagery directly.
    Cesium.Ion.defaultAccessToken = '';

    this.viewer = new Cesium.Viewer(this.container, {
      // Use OpenStreetMap imagery as base layer for better street-level detail
      imageryProvider: new Cesium.OpenStreetMapImageryProvider({
        url: 'https://a.tile.openstreetmap.org/'
      }),
      // Use ellipsoid terrain (flat) — we rely on 3D tiles for ground surface
      terrain: undefined,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      vrButton: false,
      infoBox: false,              // Disable default info box on click
      selectionIndicator: false,   // Disable green selection bracket
      // Continuous rendering — this is a game, we need every frame
      requestRenderMode: false,
      shadows: false, // Disable shadows for performance
      creditContainer: document.getElementById('cesium-credit-container')
    });

    // Disable default Cesium camera controls (we use our own)
    const sscc = this.viewer.scene.screenSpaceCameraController;
    sscc.enableInputs = false;
    sscc.enableZoom = false;
    sscc.enableRotate = false;
    sscc.enableLook = false;
    sscc.enableTilt = false;
    sscc.enableTranslate = false;

    this.scene = this.viewer.scene;

    // Hide the globe — Google 3D Tiles provide their own ground surface.
    // The globe at sea level (~0m) creates a visible "gray sea" that cuts through
    // the 3D tile buildings, which is the root cause of the gray floor issue.
    this.scene.globe.show = false;

    // Set background color for any gaps (dark to match asphalt)
    this.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a1a2e');

    this.scene.globe.enableLighting = false;
    this.scene.skyBox.show = true;
    this.scene.skyAtmosphere.show = true;

    // Disable depth test against terrain since globe is hidden
    this.scene.globe.depthTestAgainstTerrain = false;

    // Load Google Photorealistic 3D Tiles
    if (this.apiKey) {
      try {
        const tileset = await Cesium.Cesium3DTileset.fromUrl(
          `https://tile.googleapis.com/v1/3dtiles/root.json?key=${this.apiKey}`,
          {
            showCreditsOnScreen: true,
            maximumScreenSpaceError: 16,  // Relaxed detail to ensure basic geometry loads
            maximumMemoryUsage: 2048      // Allow more memory
          }
        );
        this.scene.primitives.add(tileset);
        this.tileset = tileset;  // Store reference for readiness checks
        this.has3DTiles = true;
        console.log('Google 3D Tiles loaded');
      } catch (error) {
        console.warn('Google 3D Tiles failed to load:', error.message);
        console.warn('Playing with standard globe. Check your API key and enable Map Tiles API.');
        this.has3DTiles = false;
      }
    } else {
      console.warn('No Google Maps API key provided. Playing with standard globe.');
      this.has3DTiles = false;
    }

    // NOTE: We intentionally do NOT set an initial camera view here.
    // The CameraController will snap to the correct street-level position
    // behind the tank on its first update frame.
  }

  async loadArena(arenaId) {
    // Try to load pre-cached arena data
    try {
      const response = await fetch(`/src/arenas/${arenaId}.json`);
      if (response.ok) {
        this.arena = await response.json();
        console.log('Arena loaded:', this.arena.name);
        return;
      }
    } catch (e) {
      console.warn('Failed to load arena data, using defaults');
    }

    // Fallback arena data (Manhattan)
    this.arena = {
      id: arenaId,
      name: arenaId.charAt(0).toUpperCase() + arenaId.slice(1),
      bounds: {
        south: 40.748, west: -73.990, north: 40.758, east: -73.978
      },
      buildings: [],
      spawns: [
        { lon: -73.98414, lat: 40.75317, height: 2 },
        { lon: -73.98436, lat: 40.75250, height: 2 },
        { lon: -73.98650, lat: 40.75380, height: 2 },
        { lon: -73.98300, lat: 40.75350, height: 2 }
      ]
    };
  }

  setupEventHandlers() {
    // Shooting
    this.inputManager.on('fire', () => this.handleFire());

    // Scoreboard toggle (Tab)
    this.inputManager.on('toggleScoreboard', () => {
      this.scoreboard.toggle();
    });

    // Speed adjustment (Q/E)
    this.inputManager.on('speedDown', () => {
      this.tank.adjustSpeed(-2);
    });
    this.inputManager.on('speedUp', () => {
      this.tank.adjustSpeed(2);
    });

    // Reset Position (Unstuck)
    this.inputManager.on('reset', () => {
      if (this.tank) {
        const spawns = this.arena.spawns;
        const spawn = spawns[Math.floor(Math.random() * spawns.length)];
        this.tank.position = Cesium.Cartesian3.fromDegrees(spawn.lon, spawn.lat, spawn.height || 2);
        this.tank.speed = 0;
        this.tank.heading = 0;
      }
    });

    // Handle projectile hits
    this.projectileManager.on('hit', (data) => this.handleHit(data));

    // Handle tank death
    this.tank.on('death', () => this.handleTankDeath());
  }

  handleFire() {
    if (!this.isRunning || !this.tank.canFire()) return;

    const projectile = this.tank.fire();
    if (projectile) {
      this.projectileManager.add(projectile);

      // Notify server if connected
      if (this.network) {
        this.network.sendFire(projectile);
      }

      // Update HUD
      this.hud.onFired();
    }
  }

  handleHit(data) {
    // Notify server if connected
    if (this.network) {
      this.network.sendHit(data);
    }

    if (data.target === 'tank' && data.tankId !== this.tank.id) {
      this.hud.addKillFeedEntry({
        killer: this.tank.name,
        victim: data.targetName || 'Unknown'
      });
    }
  }

  handleTankDeath() {
    this.hud.addKillFeedEntry({
      killer: this.tank.name,
      victim: this.tank.name,
      isSuicide: true
    });

    // Respawn after delay
    setTimeout(() => {
      const spawnPoint = this.arena.spawns[Math.floor(Math.random() * this.arena.spawns.length)];
      const respawnHeight = (this.groundClamper ? this.groundClamper.fallbackGroundLevel : 5)
        + (this.groundClamper ? this.groundClamper.baseHeight : 3);
      this.tank.respawn(Cesium.Cartesian3.fromDegrees(
        spawnPoint.lon,
        spawnPoint.lat,
        respawnHeight
      ));
    }, 3000);
  }

  start() {
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop();
  }

  gameLoop(currentTime = performance.now()) {
    if (!this.isRunning) return;

    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Cap delta time to prevent huge jumps
    const cappedDelta = Math.min(deltaTime, 0.1);

    this.update(cappedDelta);

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  update(deltaTime) {
    const input = this.inputManager.getInput();

    // Move crosshair to follow mouse cursor
    if (this.crosshairEl && input.mouseX !== undefined) {
      this.crosshairEl.style.left = input.mouseX + 'px';
      this.crosshairEl.style.top = input.mouseY + 'px';
    }

    // Raycast for turret aiming
    let aimPoint = null;
    if (this.tank && this.tank.isLocal) {
      const mouseX = input.mouseX;
      const mouseY = input.mouseY;

      if (mouseX !== undefined && mouseY !== undefined) {
        const mousePosition = new Cesium.Cartesian2(mouseX, mouseY);

        // Try picking 3D tiles first
        try {
          aimPoint = this.scene.pickPosition(mousePosition);
        } catch (e) { /* ignore */ }

        // Fallback to globe
        if (!aimPoint || !Cesium.defined(aimPoint)) {
          const ray = this.viewer.camera.getPickRay(mousePosition);
          if (ray) {
            aimPoint = this.scene.globe.pick(ray, this.scene);
          }
        }

        // Final fallback: project mouse ray onto local ground plane at tank height
        // This ensures turret ALWAYS aims at the mouse, even before tiles load
        if (!aimPoint || !Cesium.defined(aimPoint)) {
          const ray = this.viewer.camera.getPickRay(mousePosition);
          if (ray && this.tank.position) {
            // Create a plane at the tank's position, normal = local up
            const tankCarto = Cesium.Cartographic.fromCartesian(this.tank.position);
            if (tankCarto) {
              const up = Cesium.Cartesian3.normalize(
                this.tank.position, new Cesium.Cartesian3()
              );
              const plane = Cesium.Plane.fromPointNormal(this.tank.position, up);
              const t = Cesium.IntersectionTests.rayPlane(ray, plane);
              if (t) {
                aimPoint = t;
              }
            }
          }
        }
      }
    }

    // Update tank
    this.tank.update(deltaTime, input, this.buildingCollider, this.groundClamper, aimPoint);

    // Clear input deltas
    this.inputManager.clearDelta();

    // Update camera
    this.cameraController.update(deltaTime, input);

    // Update projectiles
    this.projectileManager.update(deltaTime);

    // Update network (if connected)
    if (this.network) {
      this.network.update(deltaTime);
    }

    // Update HUD
    this.hud.update(deltaTime);

    // Update minimap
    this.minimap.update(this.tank, this.remoteTanks);
  }

  // Network callback methods
  onPlayerJoined(player) {
    const spawnPoint = this.arena.spawns[this.remoteTanks.size % this.arena.spawns.length];
    const tank = new Tank(this.viewer, {
      position: Cesium.Cartesian3.fromDegrees(
        spawnPoint.lon,
        spawnPoint.lat,
        spawnPoint.height || 2
      ),
      isLocal: false,
      name: player.name,
      id: player.id
    });
    tank.init();
    this.remoteTanks.set(player.id, tank);
  }

  onPlayerLeft(playerId) {
    const tank = this.remoteTanks.get(playerId);
    if (tank) {
      tank.destroy();
      this.remoteTanks.delete(playerId);
    }
  }

  onPlayerUpdate(data) {
    const tank = this.remoteTanks.get(data.playerId || data.id);
    if (tank) {
      tank.networkUpdate(data);
    }
  }

  onProjectileFired(data) {
    // Spawn remote projectile
    if (data && data.position && data.direction) {
      this.projectileManager.add(data);
    }
  }

  onDamage(data) {
    if (data.targetId === this.tank.id) {
      this.tank.takeDamage(data.damage);
      this.hud.updateHealth(this.tank.health);
    }
  }

  onKill(data) {
    this.hud.addKillFeedEntry(data);

    if (data.victimId === this.tank.id) {
      this.handleTankDeath();
    }

    const tank = this.remoteTanks.get(data.victimId);
    if (tank) {
      tank.takeDamage(100);
    }
  }

  destroy() {
    this.isRunning = false;

    if (this.tank) {
      this.tank.destroy();
    }

    this.remoteTanks.forEach((tank) => tank.destroy());
    this.remoteTanks.clear();

    if (this.projectileManager) {
      this.projectileManager.destroy();
    }

    if (this.network) {
      this.network.disconnect();
    }

    if (this.inputManager) {
      this.inputManager.destroy();
    }

    if (this.viewer) {
      this.viewer.destroy();
    }
  }
}

export { Game };
