class BuildingCollider {
  constructor(arena) {
    this.arena = arena;
    this.buildings = arena.buildings || [];

    // Create spatial index for faster lookups
    this.spatialIndex = new Map();
    this.buildIndex();

    // Tank collision radius (meters)
    this.tankRadius = 3;
  }

  buildIndex() {
    // Simple grid-based spatial index
    const gridSize = 50; // meters
    this.spatialIndex.clear();

    this.buildings.forEach((building, index) => {
      const bounds = this.getBounds(building);

      // Add to all grid cells the building touches
      const minCellX = Math.floor(bounds.minX / gridSize);
      const maxCellX = Math.floor(bounds.maxX / gridSize);
      const minCellY = Math.floor(bounds.minY / gridSize);
      const maxCellY = Math.floor(bounds.maxY / gridSize);

      for (let x = minCellX; x <= maxCellX; x++) {
        for (let y = minCellY; y <= maxCellY; y++) {
          const key = `${x},${y}`;
          if (!this.spatialIndex.has(key)) {
            this.spatialIndex.set(key, []);
          }
          this.spatialIndex.get(key).push(index);
        }
      }
    });
  }

  getBounds(building) {
    // Convert lat/lon to meters (approximate)
    const origin = this.arena.bounds;
    const originX = this.lonToMeters(origin.west);
    const originY = this.latToMeters(origin.south);

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    building.polygon.forEach(([lon, lat]) => {
      const x = this.lonToMeters(lon) - originX;
      const y = this.latToMeters(lat) - originY;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });

    return { minX, maxX, minY, maxY };
  }

  lonToMeters(lon) {
    return lon * 111320; // approximate
  }

  latToMeters(lat) {
    return lat * 110540; // approximate
  }

  checkCollision(oldPosition, newPosition) {
    const cartographic = Cesium.Cartographic.fromCartesian(newPosition);
    const point = {
      x: this.lonToMeters(Cesium.Math.toDegrees(cartographic.longitude)),
      y: this.latToMeters(Cesium.Math.toDegrees(cartographic.latitude))
    };

    const origin = this.arena.bounds;
    const originX = this.lonToMeters(origin.west);
    const originY = this.latToMeters(origin.south);
    const relX = point.x - originX;
    const relY = point.y - originY;

    // Check nearby grid cells
    const gridSize = 50;
    const cellX = Math.floor(relX / gridSize);
    const cellY = Math.floor(relY / gridSize);

    const nearby = [
      `${cellX},${cellY}`,
      `${cellX-1},${cellY}`,
      `${cellX+1},${cellY}`,
      `${cellX},${cellY-1}`,
      `${cellX},${cellY+1}`
    ];

    for (const key of nearby) {
      const buildingIndices = this.spatialIndex.get(key);
      if (!buildingIndices) continue;

      for (const index of buildingIndices) {
        const building = this.buildings[index];
        if (this.pointInPolygon(relX, relY, building)) {
          return true;
        }

        // Check circle collision
        if (this.circleInPolygon(relX, relY, this.tankRadius, building)) {
          return true;
        }
      }
    }

    return false;
  }

  checkCollisionLine(start, end) {
    // Ray-marching approach for fast line collision
    const steps = 5;
    const direction = Cesium.Cartesian3.subtract(end, start, new Cesium.Cartesian3());
    const stepVector = Cesium.Cartesian3.divideByScalar(direction, steps, new Cesium.Cartesian3());

    for (let i = 1; i <= steps; i++) {
      const pos = Cesium.Cartesian3.add(start, stepVector, new Cesium.Cartesian3());
      Cesium.Cartesian3.multiplyByScalar(pos, i, pos);

      if (this.checkCollision(start, pos)) {
        return true;
      }
    }

    return false;
  }

  pointInPolygon(x, y, building) {
    const polygon = building.polygon;
    const origin = this.arena.bounds;
    const originX = this.lonToMeters(origin.west);
    const originY = this.latToMeters(origin.south);

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = this.lonToMeters(polygon[i][0]) - originX;
      const yi = this.latToMeters(polygon[i][1]) - originY;
      const xj = this.lonToMeters(polygon[j][0]) - originX;
      const yj = this.latToMeters(polygon[j][1]) - originY;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);

      if (intersect) inside = !inside;
    }

    return inside;
  }

  circleInPolygon(cx, cy, radius, building) {
    // Check if circle intersects polygon
    // First check if center is inside
    if (this.pointInPolygon(cx, cy, building)) {
      return true;
    }

    // Check if any edge is within radius
    const polygon = building.polygon;
    const origin = this.arena.bounds;
    const originX = this.lonToMeters(origin.west);
    const originY = this.latToMeters(origin.south);

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = this.lonToMeters(polygon[i][0]) - originX;
      const yi = this.latToMeters(polygon[i][1]) - originY;
      const xj = this.lonToMeters(polygon[j][0]) - originX;
      const yj = this.latToMeters(polygon[j][1]) - originY;

      const dist = this.pointToSegmentDistance(cx, cy, xi, yi, xj, yj);
      if (dist < radius) {
        return true;
      }
    }

    return false;
  }

  pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  }

  getSlidePosition(oldPosition, newPosition) {
    // Try to slide along the collision surface
    const cartographic = Cesium.Cartographic.fromCartesian(newPosition);
    const point = {
      x: this.lonToMeters(Cesium.Math.toDegrees(cartographic.longitude)),
      y: this.latToMeters(Cesium.Math.toDegrees(cartographic.latitude))
    };

    const oldCartographic = Cesium.Cartographic.fromCartesian(oldPosition);
    const oldPoint = {
      x: this.lonToMeters(Cesium.Math.toDegrees(oldCartographic.longitude)),
      y: this.latToMeters(Cesium.Math.toDegrees(oldCartographic.latitude))
    };

    // Calculate slide direction (perpendicular to collision)
    const dx = point.x - oldPoint.x;
    const dy = point.y - oldPoint.y;

    // Try moving in X only
    const tryX = Cesium.Cartesian3.clone(oldPosition);
    const tryXCarto = Cesium.Cartographic.fromCartesian(tryX);
    tryXCarto.longitude += dx / 111320;
    tryXCarto.longitude = Cesium.Math.toRadians(Cesium.Math.toDegrees(tryXCarto.longitude));

    if (!this.checkCollision(oldPosition, Cesium.Cartographic.toCartesian(tryXCarto))) {
      return Cesium.Cartographic.toCartesian(tryXCarto);
    }

    // Try moving in Y only
    const tryY = Cesium.Cartesian3.clone(oldPosition);
    const tryYCarto = Cesium.Cartographic.fromCartesian(tryY);
    tryYCarto.latitude += dy / 110540;
    tryYCarto.latitude = Cesium.Math.toRadians(Cesium.Math.toDegrees(tryYCarto.latitude));

    if (!this.checkCollision(oldPosition, Cesium.Cartographic.toCartesian(tryYCarto))) {
      return Cesium.Cartographic.toCartesian(tryYCarto);
    }

    return null;
  }
}

export { BuildingCollider };
