class Minimap {
  constructor(arena) {
    this.arena = arena;
    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas.getContext('2d');

    // Minimap settings
    this.size = 150;
    this.scale = this.size / 1000; // Assuming ~1km arena

    // Colors
    this.colors = {
      background: 'rgba(0, 0, 0, 0.7)',
      grid: 'rgba(255, 255, 255, 0.1)',
      localPlayer: '#00ff00',
      remotePlayer: '#ff0000',
      building: 'rgba(100, 100, 100, 0.5)'
    };

    // Convert arena bounds to meters
    const origin = this.arena.bounds;
    this.originX = this.lonToMeters(origin.west);
    this.originY = this.latToMeters(origin.south);
    this.width = this.lonToMeters(origin.east) - this.originX;
    this.height = this.latToMeters(origin.north) - this.originY;

    // Calculate scale to fit arena in canvas
    this.scaleX = this.size / this.width;
    this.scaleY = this.size / this.height;
    this.scale = Math.min(this.scaleX, this.scaleY);
  }

  update(localTank, remoteTanks) {
    this.clear();
    this.drawBackground();

    // Draw buildings
    this.drawBuildings();

    // Draw remote tanks
    remoteTanks.forEach((tank) => {
      if (!tank.isDead) {
        this.drawTank(tank, this.colors.remotePlayer);
      }
    });

    // Draw local tank
    if (localTank && !localTank.isDead) {
      this.drawTank(localTank, this.colors.localPlayer, true);
    }
  }

  clear() {
    this.ctx.clearRect(0, 0, this.size, this.size);
  }

  drawBackground() {
    this.ctx.fillStyle = this.colors.background;
    this.ctx.fillRect(0, 0, this.size, this.size);

    // Draw grid
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.lineWidth = 1;

    for (let x = 0; x < this.size; x += 25) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.size);
      this.ctx.stroke();
    }

    for (let y = 0; y < this.size; y += 25) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.size, y);
      this.ctx.stroke();
    }
  }

  drawBuildings() {
    if (!this.arena.buildings || this.arena.buildings.length === 0) return;

    this.ctx.fillStyle = this.colors.building;

    this.arena.buildings.forEach(building => {
      this.ctx.beginPath();
      building.polygon.forEach((point, index) => {
        const x = this.worldToMinimapX(point[0]);
        const y = this.worldToMinimapY(point[1]);

        if (index === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      });
      this.ctx.closePath();
      this.ctx.fill();
    });
  }

  drawTank(tank, color, isLocal = false) {
    const cartographic = Cesium.Cartographic.fromCartesian(tank.position);
    const lon = Cesium.Math.toDegrees(cartographic.longitude);
    const lat = Cesium.Math.toDegrees(cartographic.latitude);

    const x = this.worldToMinimapX(lon);
    const y = this.worldToMinimapY(lat);

    // Draw tank dot
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, isLocal ? 4 : 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw heading indicator for local player
    if (isLocal) {
      const heading = tank.heading;
      const indicatorLength = 8;
      const endX = x + Math.cos(heading) * indicatorLength;
      const endY = y + Math.sin(heading) * indicatorLength;

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();
    }
  }

  lonToMeters(lon) {
    return lon * 111320;
  }

  latToMeters(lat) {
    return lat * 110540;
  }

  worldToMinimapX(lon) {
    const meters = this.lonToMeters(lon);
    const relative = meters - this.originX;
    return Math.max(0, Math.min(this.size, relative * this.scale));
  }

  worldToMinimapY(lat) {
    const meters = this.latToMeters(lat);
    const relative = meters - this.originY;
    // Flip Y for canvas coordinates
    return Math.max(0, Math.min(this.size, this.size - relative * this.scale));
  }
}

export { Minimap };
