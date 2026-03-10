/**
 * Manages projectile entities — spawning, movement, collision, effects.
 * Projectile direction is in world space (Cartesian3).
 */
class ProjectileManager {
  constructor(viewer, collider, groundClamper) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.collider = collider;
    this.groundClamper = groundClamper;

    this.projectiles = new Map();
    this.nextId = 0;

    this.callbacks = { hit: [] };

    this.maxLifetime = 4;   // seconds
    this.maxRange = 600;     // meters
  }

  add(projectileData) {
    const id = projectileData.id || `proj_${this.nextId++}`;

    const position = Cesium.Cartesian3.clone(projectileData.position);
    const direction = Cesium.Cartesian3.clone(projectileData.direction);
    Cesium.Cartesian3.normalize(direction, direction);

    const projectile = {
      id,
      ownerId: projectileData.ownerId,
      position,
      direction,
      speed: projectileData.speed || 250,
      damage: projectileData.damage || 25,
      lifetime: 0,
      startPosition: Cesium.Cartesian3.clone(position),
      active: true,
      entity: this.viewer.entities.add({
        position: position,
        point: {
          pixelSize: 6,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.ORANGE,
          outlineWidth: 2
        }
      })
    };

    this.projectiles.set(id, projectile);
    return id;
  }

  update(deltaTime) {
    const toRemove = [];

    this.projectiles.forEach((proj, id) => {
      if (!proj.active) return;

      proj.lifetime += deltaTime;

      if (proj.lifetime >= this.maxLifetime) {
        toRemove.push(id);
        return;
      }

      // Move projectile along direction
      const movement = Cesium.Cartesian3.multiplyByScalar(
        proj.direction, proj.speed * deltaTime, new Cesium.Cartesian3()
      );

      const oldPos = Cesium.Cartesian3.clone(proj.position);
      const newPos = Cesium.Cartesian3.add(
        proj.position, movement, new Cesium.Cartesian3()
      );

      // Check max range
      const distFromStart = Cesium.Cartesian3.distance(proj.startPosition, newPos);
      if (distFromStart >= this.maxRange) {
        toRemove.push(id);
        this.createHitEffect(newPos, 'ground');
        return;
      }

      // Check building collision
      const hit = this.checkCollisions(oldPos, newPos, id);
      if (hit) {
        toRemove.push(id);
        this.createHitEffect(hit.position, hit.type);
        this.emit('hit', {
          projectileId: id,
          ownerId: proj.ownerId,
          target: hit.type,
          tankId: hit.tankId,
          position: hit.position
        });
        return;
      }

      // Update position
      proj.position = newPos;
      if (proj.entity) {
        proj.entity.position = newPos;
      }
    });

    toRemove.forEach(id => this.remove(id));
  }

  checkCollisions(oldPos, newPos, projectileId) {
    // Building collision
    if (this.collider && this.collider.checkCollisionLine(oldPos, newPos)) {
      return { type: 'building', position: newPos };
    }

    // Ground collision
    try {
      const cartographic = Cesium.Cartographic.fromCartesian(newPos);
      if (cartographic) {
        const groundHeight = this.scene.sampleHeight(cartographic);
        if (groundHeight !== undefined && !isNaN(groundHeight) && cartographic.height < groundHeight + 1) {
          return { type: 'ground', position: newPos };
        }
      }
    } catch (e) { /* ignore */ }

    return null;
  }

  createHitEffect(position, type) {
    const color = type === 'tank' ? Cesium.Color.RED : Cesium.Color.ORANGE;

    const entity = this.viewer.entities.add({
      position: position,
      point: {
        pixelSize: 16,
        color: color.withAlpha(0.9),
        outlineColor: Cesium.Color.YELLOW,
        outlineWidth: 3
      }
    });

    setTimeout(() => {
      try { this.viewer.entities.remove(entity); } catch (e) { /* ignore */ }
    }, 300);
  }

  remove(id) {
    const proj = this.projectiles.get(id);
    if (proj) {
      if (proj.entity) {
        try { this.viewer.entities.remove(proj.entity); } catch (e) { /* ignore */ }
      }
      this.projectiles.delete(id);
    }
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  emit(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  destroy() {
    this.projectiles.forEach(proj => {
      if (proj.entity) {
        try { this.viewer.entities.remove(proj.entity); } catch (e) { /* ignore */ }
      }
    });
    this.projectiles.clear();
  }
}

export { ProjectileManager };
