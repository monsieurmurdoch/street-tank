/**
 * Tank entity with correct Cesium heading convention:
 *   heading = 0  → facing North
 *   heading = π/2 → facing East
 *   Positive heading rotates clockwise (North → East → South → West)
 *
 * Movement uses local ENU frame (East-North-Up).
 * Forward direction: [sin(heading), cos(heading), 0] in ENU.
 */

class Tank {
  constructor(viewer, options = {}) {
    this.viewer = viewer;
    this.scene = viewer.scene;

    // Identity
    this.id = options.id || this.generateId();
    this.name = options.name || 'Tank';
    this.isLocal = options.isLocal !== false;

    // Position and orientation
    this.position = options.position || Cesium.Cartesian3.ZERO;
    this.heading = 0;        // Hull heading (radians, Cesium convention: 0=North, CW positive)
    this.turretHeading = 0;  // Turret heading (radians, same convention)
    this.turretPitch = 0;    // Turret pitch (radians, positive = up, negative = down)
    this.pitch = 0;          // Terrain pitch

    // Movement
    this.speed = 0;
    this.maxSpeed = 25;       // m/s
    this.acceleration = 18;
    this.deceleration = 12;
    this.turnSpeed = 1.8;     // rad/s
    this.turretTurnSpeed = 3; // rad/s

    // Turret pitch limits
    this.minTurretPitch = Cesium.Math.toRadians(-15);
    this.maxTurretPitch = Cesium.Math.toRadians(30);

    // Combat
    this.maxHealth = 100;
    this.health = this.maxHealth;
    this.reloadTime = 0.5;    // seconds between shots
    this.lastFireTime = 0;
    this.isDead = false;

    // Visual entities
    this.hullEntity = null;
    this.nameEntity = null;

    // --- Color Palette: 3-tone camo ---
    if (this.isLocal) {
      this.colorBase = Cesium.Color.fromCssColorString('#4a6b3a');  // olive drab
      this.colorDark = Cesium.Color.fromCssColorString('#2f4a25');  // dark olive
      this.colorAccent = Cesium.Color.fromCssColorString('#5c7a47');  // light olive
    } else {
      this.colorBase = Cesium.Color.fromCssColorString('#6b3a3a');  // desert tan-red
      this.colorDark = Cesium.Color.fromCssColorString('#4a2525');  // dark red
      this.colorAccent = Cesium.Color.fromCssColorString('#8a5050');  // light red
    }
    this.colorMetal = Cesium.Color.fromCssColorString('#1a1a1a');  // gunmetal
    this.colorTrack = Cesium.Color.fromCssColorString('#222222');  // dark track
    this.colorWheel = Cesium.Color.fromCssColorString('#383838');  // wheel hubs

    // Dimensions (meters) — more realistic proportions
    this.hullWidth = 3.6;
    this.hullLength = 7.2;
    this.hullHeight = 1.6;
    this.turretWidth = 2.6;
    this.turretLength = 3.0;
    this.turretHeight = 1.2;
    this.barrelLength = 5.5;
    this.barrelRadius = 0.22;
    this.trackWidth = 0.65;
    this.trackHeight = 0.9;

    // Events
    this.callbacks = { death: [], fire: [] };
  }

  async init() {
    this.createModel();
  }

  createModel() {
    this.destroy();

    // Point marker (always visible via disableDepthTestDistance)
    this.hullEntity = this.viewer.entities.add({
      position: this.position,
      point: {
        pixelSize: 10,
        color: this.isLocal ? Cesium.Color.LIME : Cesium.Color.RED,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });

    // Name label
    this.nameEntity = this.viewer.entities.add({
      position: this.position,
      label: {
        text: this.name,
        font: 'bold 12px monospace',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 3,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -25),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 1.0,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.4)
      }
    });

    this._tankPrimitives = [];
    this.updateEntities();
  }

  /**
   * Create a box primitive with depth testing disabled.
   */
  _box(position, orientation, dims, color) {
    const modelMatrix = Cesium.Matrix4.fromTranslationQuaternionRotationScale(
      position, orientation,
      new Cesium.Cartesian3(dims.x / 2, dims.y / 2, dims.z / 2),
      new Cesium.Matrix4()
    );

    const instance = new Cesium.GeometryInstance({
      geometry: Cesium.BoxGeometry.fromDimensions({
        dimensions: new Cesium.Cartesian3(2, 2, 2),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT
      }),
      modelMatrix: modelMatrix,
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(color)
      }
    });

    const primitive = new Cesium.Primitive({
      geometryInstances: instance,
      appearance: new Cesium.PerInstanceColorAppearance({
        flat: false,
        renderState: {
          depthTest: { enabled: false },
          depthMask: false
        }
      }),
      asynchronous: false
    });

    this.scene.primitives.add(primitive);
    this._tankPrimitives.push(primitive);
  }

  // ─── ENU Helpers ───────────────────────────────────────────

  getENU() {
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(this.position);
    const rot = new Cesium.Matrix3();
    Cesium.Matrix4.getMatrix3(enu, rot);
    const east = new Cesium.Cartesian3(), north = new Cesium.Cartesian3(), up = new Cesium.Cartesian3();
    Cesium.Matrix4.getColumn(enu, 0, east);
    Cesium.Matrix4.getColumn(enu, 1, north);
    Cesium.Matrix4.getColumn(enu, 2, up);
    Cesium.Cartesian3.normalize(east, east);
    Cesium.Cartesian3.normalize(north, north);
    Cesium.Cartesian3.normalize(up, up);
    return { enu, rot, east, north, up };
  }

  getOffsetPosition(localEast, localNorth, localUp) {
    const { east, north, up } = this.getENU();
    const result = Cesium.Cartesian3.clone(this.position);
    const temp = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(east, localEast, temp);
    Cesium.Cartesian3.add(result, temp, result);
    Cesium.Cartesian3.multiplyByScalar(north, localNorth, temp);
    Cesium.Cartesian3.add(result, temp, result);
    Cesium.Cartesian3.multiplyByScalar(up, localUp, temp);
    Cesium.Cartesian3.add(result, temp, result);
    return result;
  }

  _orient(heading, pitch = this.pitch) {
    const { rot } = this.getENU();
    const hpr = new Cesium.HeadingPitchRoll(heading, pitch, 0);
    const localRot = Cesium.Matrix3.fromHeadingPitchRoll(hpr);
    const finalRot = new Cesium.Matrix3();
    Cesium.Matrix3.multiply(rot, localRot, finalRot);
    return Cesium.Quaternion.fromRotationMatrix(finalRot);
  }

  getForwardDirection(heading) {
    const { east, north } = this.getENU();
    const forward = new Cesium.Cartesian3(), temp = new Cesium.Cartesian3();
    Cesium.Cartesian3.multiplyByScalar(east, Math.sin(heading), forward);
    Cesium.Cartesian3.multiplyByScalar(north, Math.cos(heading), temp);
    Cesium.Cartesian3.add(forward, temp, forward);
    Cesium.Cartesian3.normalize(forward, forward);
    return forward;
  }

  getAimDirection(heading, pitch) {
    const { east, north, up } = this.getENU();
    const forward = new Cesium.Cartesian3(), temp = new Cesium.Cartesian3();
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    Cesium.Cartesian3.multiplyByScalar(east, Math.sin(heading) * cp, forward);
    Cesium.Cartesian3.multiplyByScalar(north, Math.cos(heading) * cp, temp);
    Cesium.Cartesian3.add(forward, temp, forward);
    Cesium.Cartesian3.multiplyByScalar(up, sp, temp);
    Cesium.Cartesian3.add(forward, temp, forward);
    Cesium.Cartesian3.normalize(forward, forward);
    return forward;
  }

  // ─── Visual Update ─────────────────────────────────────────

  updateEntities() {
    if (!this.hullEntity) return;

    this.hullEntity.position = this.position;
    if (this.nameEntity) {
      this.nameEntity.position = this.getOffsetPosition(0, 0, this.hullHeight + this.turretHeight + 2);
    }

    // Clear old primitives
    if (this._tankPrimitives) {
      for (const p of this._tankPrimitives) { this.scene.primitives.remove(p); }
      this._tankPrimitives = [];
    }

    if (this.isDead) return;

    const hO = this._orient(this.heading);
    const tO = this._orient(this.turretHeading);

    // ── HULL: Main body ──
    this._box(this.position, hO,
      new Cesium.Cartesian3(this.hullWidth, this.hullLength, this.hullHeight),
      this.colorBase
    );

    // Hull front slope (wedge-like)
    const fwdF = this.hullLength * 0.42;
    const frontPos = this.getOffsetPosition(
      Math.sin(this.heading) * fwdF,
      Math.cos(this.heading) * fwdF, 0.35
    );
    this._box(frontPos, hO,
      new Cesium.Cartesian3(this.hullWidth * 0.85, 1.4, this.hullHeight * 0.5),
      this.colorDark
    );

    // Hull rear plate
    const rearF = -this.hullLength * 0.4;
    const rearPos = this.getOffsetPosition(
      Math.sin(this.heading) * rearF,
      Math.cos(this.heading) * rearF, this.hullHeight * 0.35
    );
    this._box(rearPos, hO,
      new Cesium.Cartesian3(this.hullWidth * 0.7, 1.5, 0.5),
      this.colorDark
    );

    // Camo accent stripe (diagonal dark patch on hull)
    const camoOff = this.hullLength * 0.1;
    const camoPos = this.getOffsetPosition(
      Math.sin(this.heading) * camoOff - Math.cos(this.heading) * 0.5,
      Math.cos(this.heading) * camoOff + Math.sin(this.heading) * 0.5,
      this.hullHeight * 0.52
    );
    this._box(camoPos, hO,
      new Cesium.Cartesian3(1.8, 2.0, 0.15),
      this.colorDark
    );

    // ── TRACKS ──
    const trackOffX = (this.hullWidth + this.trackWidth) / 2 + 0.05;
    const trackY = -(this.hullHeight - this.trackHeight) / 2 - 0.05;

    // Left track
    const ltE = -Math.cos(this.heading) * trackOffX;
    const ltN = Math.sin(this.heading) * trackOffX;
    this._box(this.getOffsetPosition(ltE, ltN, trackY), hO,
      new Cesium.Cartesian3(this.trackWidth, this.hullLength + 0.3, this.trackHeight),
      this.colorTrack
    );

    // Right track
    const rtE = Math.cos(this.heading) * trackOffX;
    const rtN = -Math.sin(this.heading) * trackOffX;
    this._box(this.getOffsetPosition(rtE, rtN, trackY), hO,
      new Cesium.Cartesian3(this.trackWidth, this.hullLength + 0.3, this.trackHeight),
      this.colorTrack
    );

    // Track guard / fender (thin plates over tracks)
    const fenderH = this.hullHeight * 0.52;
    const fenderW = this.trackWidth + 0.3;
    this._box(this.getOffsetPosition(ltE, ltN, fenderH), hO,
      new Cesium.Cartesian3(fenderW, this.hullLength * 0.95, 0.12),
      this.colorAccent
    );
    this._box(this.getOffsetPosition(rtE, rtN, fenderH), hO,
      new Cesium.Cartesian3(fenderW, this.hullLength * 0.95, 0.12),
      this.colorAccent
    );

    // Road wheels (3 per side)
    for (let i = -1; i <= 1; i++) {
      const wheelF = i * 2.2;
      const wFE = Math.sin(this.heading) * wheelF;
      const wFN = Math.cos(this.heading) * wheelF;
      this._box(this.getOffsetPosition(ltE + wFE, ltN + wFN, trackY), hO,
        new Cesium.Cartesian3(0.3, 0.7, 0.7), this.colorWheel
      );
      this._box(this.getOffsetPosition(rtE + wFE, rtN + wFN, trackY), hO,
        new Cesium.Cartesian3(0.3, 0.7, 0.7), this.colorWheel
      );
    }

    // ── TURRET ──
    const turretUp = (this.hullHeight + this.turretHeight) / 2;
    const turretPos = this.getOffsetPosition(0, 0, turretUp);

    // Main turret body
    this._box(turretPos, tO,
      new Cesium.Cartesian3(this.turretWidth, this.turretLength, this.turretHeight),
      this.colorBase
    );

    // Turret front mantlet (thicker front plate)
    const mantletFwd = this.turretLength * 0.4;
    const mantletPos = this.getOffsetPosition(
      Math.sin(this.turretHeading) * mantletFwd,
      Math.cos(this.turretHeading) * mantletFwd, turretUp
    );
    this._box(mantletPos, tO,
      new Cesium.Cartesian3(this.turretWidth * 0.7, 0.5, this.turretHeight * 0.85),
      this.colorDark
    );

    // Turret camo patch
    const tcamoFwd = -this.turretLength * 0.15;
    const tcamoPos = this.getOffsetPosition(
      Math.sin(this.turretHeading) * tcamoFwd + Math.cos(this.turretHeading) * 0.5,
      Math.cos(this.turretHeading) * tcamoFwd - Math.sin(this.turretHeading) * 0.5,
      turretUp + this.turretHeight * 0.52
    );
    this._box(tcamoPos, tO,
      new Cesium.Cartesian3(1.2, 1.4, 0.1), this.colorDark
    );

    // Turret bustle (rear overhang for ammo storage)
    const bustleFwd = -this.turretLength * 0.45;
    const bustlePos = this.getOffsetPosition(
      Math.sin(this.turretHeading) * bustleFwd,
      Math.cos(this.turretHeading) * bustleFwd, turretUp + 0.1
    );
    this._box(bustlePos, tO,
      new Cesium.Cartesian3(this.turretWidth * 0.85, 1.0, this.turretHeight * 0.7),
      this.colorAccent
    );

    // ── BARREL (with pitch) ──
    const barrelUp = turretUp;
    const barrelFwd = this.barrelLength / 2 + this.turretLength / 2 - 0.3;
    const cp = Math.cos(this.turretPitch), sp = Math.sin(this.turretPitch);
    const hFwd = barrelFwd * cp, vFwd = barrelFwd * sp;

    const bE = Math.sin(this.turretHeading) * hFwd;
    const bN = Math.cos(this.turretHeading) * hFwd;
    const barrelPos = this.getOffsetPosition(bE, bN, barrelUp + vFwd);
    const barrelO = this._orient(this.turretHeading, this.turretPitch);

    this._box(barrelPos, barrelO,
      new Cesium.Cartesian3(this.barrelRadius * 2, this.barrelLength, this.barrelRadius * 2),
      this.colorMetal
    );

    // Muzzle brake
    const mFwd = (this.barrelLength + this.turretLength / 2 - 0.1);
    const mH = mFwd * cp, mV = mFwd * sp;
    const muzzlePos = this.getOffsetPosition(
      Math.sin(this.turretHeading) * mH,
      Math.cos(this.turretHeading) * mH, barrelUp + mV
    );
    this._box(muzzlePos, barrelO,
      new Cesium.Cartesian3(this.barrelRadius * 3.2, 0.35, this.barrelRadius * 3.2),
      this.colorMetal
    );
  }

  // ─── Game Logic ────────────────────────────────────────────

  update(deltaTime, input, collider, groundClamper, aimPoint) {
    if (this.isDead) return;

    // Manual height adjustment
    if (input && input.heightUp) groundClamper.adjustManualOffset(2.0 * deltaTime);
    if (input && input.heightDown) groundClamper.adjustManualOffset(-2.0 * deltaTime);

    let moved = false;

    // Acceleration / braking
    if (input && input.forward) {
      this.speed = Math.min(this.speed + this.acceleration * deltaTime, this.maxSpeed);
      moved = true;
    } else if (input && input.backward) {
      this.speed = Math.max(this.speed - this.acceleration * deltaTime, -this.maxSpeed * 0.4);
      moved = true;
    } else {
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.deceleration * deltaTime);
        moved = this.speed > 0.01;
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.deceleration * deltaTime);
        moved = this.speed < -0.01;
      }
    }

    // Hull rotation
    if (input && input.left) this.heading -= this.turnSpeed * deltaTime;
    if (input && input.right) this.heading += this.turnSpeed * deltaTime;
    this.heading = ((this.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Turret aiming at mouse cursor (heading + pitch)
    if (this.isLocal && aimPoint && Cesium.defined(aimPoint)) {
      const invENU = Cesium.Matrix4.inverse(
        Cesium.Transforms.eastNorthUpToFixedFrame(this.position),
        new Cesium.Matrix4()
      );
      const localAim = new Cesium.Cartesian3();
      Cesium.Matrix4.multiplyByPoint(invENU, aimPoint, localAim);

      const targetHeading = Math.atan2(localAim.x, localAim.y);

      // ── FIX: Clamp heading delta to prevent snap-behind ──
      let headingDelta = targetHeading - this.turretHeading;
      while (headingDelta > Math.PI) headingDelta -= Math.PI * 2;
      while (headingDelta < -Math.PI) headingDelta += Math.PI * 2;

      // Cap maximum heading change per frame to prevent jumps
      const maxTurn = this.turretTurnSpeed * deltaTime;
      const maxJump = Math.PI / 2; // Never jump more than 90°
      headingDelta = Math.max(-maxJump, Math.min(maxJump, headingDelta));

      if (Math.abs(headingDelta) < maxTurn) {
        this.turretHeading = targetHeading;
      } else {
        this.turretHeading += Math.sign(headingDelta) * maxTurn;
      }

      // Pitch
      const hDist = Math.sqrt(localAim.x * localAim.x + localAim.y * localAim.y);
      let targetPitch = Math.atan2(localAim.z, hDist);
      targetPitch = Math.max(this.minTurretPitch, Math.min(this.maxTurretPitch, targetPitch));

      const pitchSpeed = 2.0;
      let pitchDelta = targetPitch - this.turretPitch;
      const maxPitchTurn = pitchSpeed * deltaTime;
      if (Math.abs(pitchDelta) < maxPitchTurn) {
        this.turretPitch = targetPitch;
      } else {
        this.turretPitch += Math.sign(pitchDelta) * maxPitchTurn;
      }
    }

    // Movement
    if (moved && Math.abs(this.speed) > 0.05) {
      const { east, north } = this.getENU();
      const moveVec = new Cesium.Cartesian3(), temp = new Cesium.Cartesian3();
      Cesium.Cartesian3.multiplyByScalar(east, Math.sin(this.heading), moveVec);
      Cesium.Cartesian3.multiplyByScalar(north, Math.cos(this.heading), temp);
      Cesium.Cartesian3.add(moveVec, temp, moveVec);
      Cesium.Cartesian3.multiplyByScalar(moveVec, this.speed * deltaTime, moveVec);

      const newPosition = Cesium.Cartesian3.add(this.position, moveVec, new Cesium.Cartesian3());

      if (collider && collider.checkCollision(this.position, newPosition)) {
        const slidePosition = collider.getSlidePosition(this.position, newPosition);
        if (slidePosition) { this.position = slidePosition; } else { this.speed = 0; }
      } else {
        this.position = newPosition;
      }
    }

    // Ground clamping
    if (groundClamper) {
      const clamped = groundClamper.clampPosition(this.position);
      if (clamped) {
        this.position = clamped.position;
        this.pitch = clamped.pitch || 0;
      }
    }

    this.updateEntities();
  }

  networkUpdate(data) {
    if (data.position) {
      if (Array.isArray(data.position)) {
        this.position = new Cesium.Cartesian3(data.position[0], data.position[1], data.position[2]);
      } else {
        this.position = new Cesium.Cartesian3(data.position.x, data.position.y, data.position.z);
      }
    }
    if (data.heading !== undefined) this.heading = data.heading;
    if (data.turretHeading !== undefined) this.turretHeading = data.turretHeading;
    if (data.turretPitch !== undefined) this.turretPitch = data.turretPitch;
    this.updateEntities();
  }

  adjustSpeed(delta) {
    this.maxSpeed = Math.max(5, Math.min(40, this.maxSpeed + delta));
  }

  canFire() {
    if (this.isDead) return false;
    return (performance.now() / 1000 - this.lastFireTime) >= this.reloadTime;
  }

  fire() {
    if (!this.canFire()) return null;
    this.lastFireTime = performance.now() / 1000;

    const turretUp = (this.hullHeight + this.turretHeight) / 2;
    const tipFwd = this.barrelLength + this.turretLength / 2 - 0.3;
    const cp = Math.cos(this.turretPitch), sp = Math.sin(this.turretPitch);
    const hF = tipFwd * cp, vF = tipFwd * sp;

    const spawnPosition = this.getOffsetPosition(
      Math.sin(this.turretHeading) * hF,
      Math.cos(this.turretHeading) * hF,
      turretUp + vF
    );

    return {
      id: this.generateId(),
      ownerId: this.id,
      position: spawnPosition,
      direction: this.getAimDirection(this.turretHeading, this.turretPitch),
      speed: 250,
      damage: 25
    };
  }

  takeDamage(amount) {
    if (this.isDead) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) this.die();
  }

  die() {
    this.isDead = true;
    this.speed = 0;
    if (this.hullEntity) this.hullEntity.show = false;
    if (this.nameEntity) this.nameEntity.show = false;
    if (this._tankPrimitives) {
      for (const p of this._tankPrimitives) { try { this.scene.primitives.remove(p); } catch (e) { } }
      this._tankPrimitives = [];
    }
    this.emit('death');
  }

  respawn(position) {
    this.isDead = false;
    this.health = this.maxHealth;
    this.speed = 0;
    this.heading = 0;
    this.turretHeading = 0;
    this.turretPitch = 0;
    if (position) this.position = Cesium.Cartesian3.clone(position);
    if (this.hullEntity) this.hullEntity.show = true;
    if (this.nameEntity) this.nameEntity.show = true;
    this.updateEntities();
  }

  on(event, callback) { if (this.callbacks[event]) this.callbacks[event].push(callback); }
  emit(event, data) { if (this.callbacks[event]) this.callbacks[event].forEach(cb => cb(data)); }

  destroy() {
    if (this.hullEntity) { this.viewer.entities.remove(this.hullEntity); this.hullEntity = null; }
    if (this.nameEntity) { this.viewer.entities.remove(this.nameEntity); this.nameEntity = null; }
    if (this._tankPrimitives) {
      for (const p of this._tankPrimitives) { try { this.scene.primitives.remove(p); } catch (e) { } }
      this._tankPrimitives = [];
    }
  }

  generateId() { return 'tank_' + Math.random().toString(36).substr(2, 9); }

  serialize() {
    return {
      id: this.id, name: this.name,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      heading: this.heading, turretHeading: this.turretHeading, turretPitch: this.turretPitch,
      health: this.health, isDead: this.isDead
    };
  }
}

export { Tank };
