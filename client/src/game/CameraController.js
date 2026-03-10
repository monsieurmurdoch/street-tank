/**
 * Third-person camera following the tank.
 * Uses Cesium heading convention: 0 = North, positive = clockwise.
 *
 * Features:
 *  - Smooth position lerp with separate horizontal/vertical rates
 *  - Dynamic zoom-out during large elevation changes
 *  - Ground clearance to prevent clipping into buildings
 */
class CameraController {
  constructor(viewer, tank) {
    this.viewer = viewer;
    this.camera = viewer.camera;
    this.tank = tank;

    // 3rd-person parameters
    this.distance = 25;        // base meters behind the tank (horizontal)
    this.baseHeight = 10;      // base meters above the tank
    this.heightOffset = 0;     // user-adjustable height offset
    this.minHeightOffset = -5;
    this.maxHeightOffset = 40;
    this.lookAtHeight = 3;     // aim camera at this height above tank base

    // Smoothing
    this.horizontalSmooth = 6;  // Horizontal follow speed
    this.verticalSmooth = 3;    // Vertical follow speed (slower = smoother on elevation changes)
    this.currentPosition = null;
    this.cameraHeading = undefined;

    // Elevation change tracking
    this.lastTankHeight = null;
    this.verticalSpeed = 0;         // Current vertical velocity of the tank (m/s)
    this.dynamicDistanceBoost = 0;  // Extra zoom-out distance during fast vertical movement
    this.maxDistanceBoost = 20;     // Max additional distance during elevation transitions
  }

  update(deltaTime, input) {
    if (!this.tank || this.tank.isDead) return;

    const tankPosition = this.tank.position;
    if (!tankPosition || Cesium.Cartesian3.equals(tankPosition, Cesium.Cartesian3.ZERO)) return;

    // Initialize camera heading to match tank heading on first frame
    if (this.cameraHeading === undefined) {
      this.cameraHeading = this.tank.heading;
    }

    // ── Track vertical speed for adaptive smoothing ──
    const tankCarto = Cesium.Cartographic.fromCartesian(tankPosition);
    const tankHeight = tankCarto ? tankCarto.height : 0;

    if (this.lastTankHeight !== null) {
      const heightDelta = tankHeight - this.lastTankHeight;
      // Smooth the vertical speed estimate
      this.verticalSpeed = this.verticalSpeed * 0.7 + (heightDelta / Math.max(deltaTime, 0.001)) * 0.3;
    }
    this.lastTankHeight = tankHeight;

    // Dynamic distance boost: zoom out when tank is moving vertically fast
    const absVertSpeed = Math.abs(this.verticalSpeed);
    const targetBoost = absVertSpeed > 5 ? Math.min(absVertSpeed * 0.8, this.maxDistanceBoost) : 0;
    this.dynamicDistanceBoost += (targetBoost - this.dynamicDistanceBoost) * 2.0 * deltaTime;

    // ── Heading follow ──
    let headingDiff = this.tank.heading - this.cameraHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.cameraHeading += headingDiff * 2.0 * deltaTime;

    // Edge-of-screen camera orbit
    if (input && input.edgeRotate) {
      this.cameraHeading -= input.edgeRotate * 1.5 * deltaTime;
    }

    // Pitch control
    if (input && input.edgePitch) {
      this.heightOffset += input.edgePitch * 15.0 * deltaTime;
      this.heightOffset = Math.max(this.minHeightOffset, Math.min(this.maxHeightOffset, this.heightOffset));
    }

    // ── Compute desired camera position ──
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(tankPosition);
    const rot = new Cesium.Matrix3();
    Cesium.Matrix4.getMatrix3(enu, rot);

    const effectiveDistance = this.distance + this.dynamicDistanceBoost;
    const effectiveHeight = this.baseHeight + this.heightOffset + this.dynamicDistanceBoost * 0.5;

    const offsetEast = -Math.sin(this.cameraHeading) * effectiveDistance;
    const offsetNorth = -Math.cos(this.cameraHeading) * effectiveDistance;
    const offsetUp = effectiveHeight;

    const localOffset = new Cesium.Cartesian3(offsetEast, offsetNorth, offsetUp);
    const worldOffset = new Cesium.Cartesian3();
    Cesium.Matrix3.multiplyByVector(rot, localOffset, worldOffset);

    const desiredPosition = Cesium.Cartesian3.add(
      tankPosition, worldOffset, new Cesium.Cartesian3()
    );

    // ── Smooth follow with separate horizontal/vertical rates ──
    if (!this.currentPosition) {
      this.currentPosition = Cesium.Cartesian3.clone(desiredPosition);
    }

    // Adaptive smoothing: slow down vertical follow during big elevation changes
    const vertSmooth = absVertSpeed > 10
      ? Math.max(1.5, this.verticalSmooth - absVertSpeed * 0.05)
      : this.verticalSmooth;

    // Compute desired position in cartographic for split smoothing
    const desiredCarto = Cesium.Cartographic.fromCartesian(desiredPosition);
    const currentCarto = Cesium.Cartographic.fromCartesian(this.currentPosition);

    if (desiredCarto && currentCarto) {
      const hLerp = 1 - Math.exp(-this.horizontalSmooth * deltaTime);
      const vLerp = 1 - Math.exp(-vertSmooth * deltaTime);

      // Horizontal: fast tracking
      currentCarto.longitude += (desiredCarto.longitude - currentCarto.longitude) * hLerp;
      currentCarto.latitude += (desiredCarto.latitude - currentCarto.latitude) * hLerp;

      // Vertical: slower, smoother tracking
      currentCarto.height += (desiredCarto.height - currentCarto.height) * vLerp;

      this.currentPosition = Cesium.Cartographic.toCartesian(currentCarto);
    } else {
      // Fallback: uniform lerp
      const lerpFactor = 1 - Math.exp(-this.horizontalSmooth * deltaTime);
      this.currentPosition = Cesium.Cartesian3.lerp(
        this.currentPosition, desiredPosition, lerpFactor, new Cesium.Cartesian3()
      );
    }

    // ── Ground clearance ──
    const camCarto = Cesium.Cartographic.fromCartesian(this.currentPosition);
    if (camCarto) {
      let groundHeight = undefined;

      try {
        const exclude = [];
        if (this.tank.hullEntity) exclude.push(this.tank.hullEntity);
        groundHeight = this.viewer.scene.sampleHeight(camCarto, exclude, 0.2);
      } catch (e) {
        // ignore
      }

      if (groundHeight === undefined) {
        groundHeight = this.viewer.scene.globe.getHeight(camCarto);
      }

      const minClearance = 3.0;
      if (groundHeight !== undefined) {
        const minCameraHeight = groundHeight + minClearance;
        if (camCarto.height < minCameraHeight) {
          // Smoothly push camera up rather than snapping
          camCarto.height += (minCameraHeight - camCarto.height) * Math.min(1.0, 4.0 * deltaTime);
          this.currentPosition = Cesium.Cartographic.toCartesian(camCarto);
        }
      }
    }

    this.camera.position = this.currentPosition;

    // ── Look at tank ──
    const upCol = new Cesium.Cartesian3();
    Cesium.Matrix4.getColumn(enu, 2, upCol);
    Cesium.Cartesian3.normalize(upCol, upCol);

    const targetPoint = Cesium.Cartesian3.add(
      tankPosition,
      Cesium.Cartesian3.multiplyByScalar(upCol, this.lookAtHeight, new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );

    const direction = Cesium.Cartesian3.subtract(
      targetPoint, this.currentPosition, new Cesium.Cartesian3()
    );

    const mag = Cesium.Cartesian3.magnitude(direction);
    if (mag > 0.001) {
      Cesium.Cartesian3.normalize(direction, direction);
      this.camera.direction = direction;
      this.camera.up = upCol;

      const right = Cesium.Cartesian3.cross(direction, upCol, new Cesium.Cartesian3());
      if (Cesium.Cartesian3.magnitude(right) > 0.001) {
        Cesium.Cartesian3.normalize(right, right);
        this.camera.right = right;
        Cesium.Cartesian3.cross(right, direction, this.camera.up);
      }
    }
  }
}

export { CameraController };
