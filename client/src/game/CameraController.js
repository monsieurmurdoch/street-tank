/**
 * Third-person camera following the tank.
 * Uses Cesium heading convention: 0 = North, positive = clockwise.
 * Positioned close behind/above the tank for a street-level feel.
 */
class CameraController {
  constructor(viewer, tank) {
    this.viewer = viewer;
    this.camera = viewer.camera;
    this.tank = tank;

    // 3rd-person parameters
    this.distance = 25;       // meters behind the tank (horizontal)
    this.baseHeight = 10;     // base meters above the tank
    this.heightOffset = 0;    // dynamic height offset adjusted by user
    this.minHeightOffset = -5; // lowest camera can go relative to base
    this.maxHeightOffset = 40; // highest camera can go
    this.lookAtHeight = 3;    // aim camera at this height above tank base

    this.smoothFactor = 6;
    this.currentPosition = null;

    this.cameraHeading = undefined;
  }

  update(deltaTime, input) {
    if (!this.tank || this.tank.isDead) return;

    const tankPosition = this.tank.position;
    if (!tankPosition || Cesium.Cartesian3.equals(tankPosition, Cesium.Cartesian3.ZERO)) return;

    // Initialize camera heading to match tank heading on first frame
    if (this.cameraHeading === undefined) {
      this.cameraHeading = this.tank.heading;
    }

    // Smoothly follow the tank's heading so camera stays behind it
    let headingDiff = this.tank.heading - this.cameraHeading;
    while (headingDiff > Math.PI) headingDiff -= Math.PI * 2;
    while (headingDiff < -Math.PI) headingDiff += Math.PI * 2;
    this.cameraHeading += headingDiff * 2.0 * deltaTime;

    // Edge-of-screen camera orbit (manual override)
    if (input && input.edgeRotate) {
      this.cameraHeading -= input.edgeRotate * 1.5 * deltaTime;
    }

    // Pitch control (manual override)
    if (input && input.edgePitch) {
      this.heightOffset += input.edgePitch * 15.0 * deltaTime;
      // Clamp height offset
      this.heightOffset = Math.max(this.minHeightOffset, Math.min(this.maxHeightOffset, this.heightOffset));
    }

    // Compute camera position: directly behind the tank at a set horizontal
    // distance and a set height, without pitch-based offsets.
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(tankPosition);
    const rot = new Cesium.Matrix3();
    Cesium.Matrix4.getMatrix3(enu, rot);

    // Camera behind the heading direction: -sin(h), -cos(h) in ENU
    const offsetEast = -Math.sin(this.cameraHeading) * this.distance;
    const offsetNorth = -Math.cos(this.cameraHeading) * this.distance;
    const offsetUp = this.baseHeight + this.heightOffset;

    const localOffset = new Cesium.Cartesian3(offsetEast, offsetNorth, offsetUp);
    const worldOffset = new Cesium.Cartesian3();
    Cesium.Matrix3.multiplyByVector(rot, localOffset, worldOffset);

    const desiredPosition = Cesium.Cartesian3.add(
      tankPosition, worldOffset, new Cesium.Cartesian3()
    );

    if (!this.currentPosition) {
      // Snap to desired position on first frame (no lerp from far away)
      this.currentPosition = Cesium.Cartesian3.clone(desiredPosition);
    }

    const lerpFactor = 1 - Math.exp(-this.smoothFactor * deltaTime);
    this.currentPosition = Cesium.Cartesian3.lerp(
      this.currentPosition, desiredPosition, lerpFactor, new Cesium.Cartesian3()
    );

    // Ground clearance check to prevent clipping into terrain (Blue Void)
    const camCarto = Cesium.Cartographic.fromCartesian(this.currentPosition);
    if (camCarto) {
      let groundHeight = undefined;

      try {
        const exclude = [];
        if (this.tank.hullEntity) exclude.push(this.tank.hullEntity);

        groundHeight = this.viewer.scene.sampleHeight(camCarto, exclude, 0.2);
      } catch (e) {
        // ignore errors
      }

      if (groundHeight === undefined) {
        groundHeight = this.viewer.scene.globe.getHeight(camCarto);
      }

      const minClearance = 2.0;
      if (groundHeight !== undefined) {
        const minCameraHeight = groundHeight + minClearance;
        if (camCarto.height < minCameraHeight) {
          camCarto.height = minCameraHeight;
          this.currentPosition = Cesium.Cartographic.toCartesian(camCarto);
        }
      }
    }

    this.camera.position = this.currentPosition;

    // Look at tank (at lookAtHeight above its base)
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
