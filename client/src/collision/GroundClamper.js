/**
 * Clamps the tank to the ground surface, prioritizing 3D Tiles over Globe terrain.
 * 
 * Strategy:
 * 1. Try to sample height from 3D Tiles (street surface).
 * 2. If valid, use it (tank sits ON TOP of street).
 * 3. If invalid (gap in tiles), fall back to Globe terrain height.
 * 4. Exclude tank's own entities from sampling to prevent self-clamping.
 */
class GroundClamper {
  constructor(viewer, groundLevel) {
    this.viewer = viewer;
    this.scene = viewer.scene;
    this.globe = viewer.scene.globe;
    this.baseHeight = 3;  // Tank center height above ground surface - Increased to prevent clipping into tiles
    // Manual height adjustment for debugging/player correction
    this.manualOffset = 0;

    // Objects to ignore during height sampling (e.g., the tank itself)
    this.excludeEntities = [];

    // Fallback ground level
    this.fallbackGroundLevel = groundLevel !== undefined ? groundLevel : 5;

    // Cache
    this.lastKnownHeight = null;
  }

  setExcludeEntities(entities) {
    this.excludeEntities = entities;
  }

  adjustManualOffset(delta) {
    this.manualOffset += delta;
    console.log(`Manual Height Offset: ${this.manualOffset.toFixed(2)}m`);
  }

  /**
   * Async initial height probe — finds the street-level height at a location.
   * Uses the arena's configured ground level as a reference baseline.
   * Samples 3D tiles in a pattern and picks the lowest height near street level,
   * filtering out obvious rooftop/building-top samples.
   */
  async findInitialGroundLevel(longitude, latitude) {
    try {
      // Use arena ground level as baseline reference
      const baselineHeight = this.fallbackGroundLevel;
      console.log(`GroundClamper: Baseline reference height = ${baselineHeight}m`);

      // Sample 3D tiles in a cross+diagonal pattern to find street-level surface
      const offset = 0.00008; // approx 8m — wider spread to hit streets
      const positions = [
        Cesium.Cartographic.fromDegrees(longitude, latitude),
        Cesium.Cartographic.fromDegrees(longitude + offset, latitude),
        Cesium.Cartographic.fromDegrees(longitude - offset, latitude),
        Cesium.Cartographic.fromDegrees(longitude, latitude + offset),
        Cesium.Cartographic.fromDegrees(longitude, latitude - offset),
        // Extra diagonal samples
        Cesium.Cartographic.fromDegrees(longitude + offset, latitude + offset),
        Cesium.Cartographic.fromDegrees(longitude - offset, latitude - offset)
      ];

      if (this.scene.primitives.length > 0) {
        const updatedPositions = await this.scene.sampleHeightMostDetailed(positions, this.excludeEntities, 0.2);

        let validHeights = [];

        if (updatedPositions) {
          for (const pos of updatedPositions) {
            if (pos.height !== undefined && pos.height !== null && pos.height > -10) {
              validHeights.push(pos.height);
            }
          }
        }

        if (validHeights.length > 0) {
          // Sort heights ascending
          validHeights.sort((a, b) => a - b);

          // Strategy: Pick the minimum height — this is most likely the street.
          // In Google 3D Tiles, streets are the lowest surfaces; rooftops are higher.
          const streetHeight = validHeights[0];

          // Log all samples for debugging
          console.log(`GroundClamper: 3D Tile samples = [${validHeights.map(h => h.toFixed(1)).join(', ')}]m`);
          console.log(`GroundClamper: Using lowest sample as street level = ${streetHeight.toFixed(2)}m`);

          this.lastKnownHeight = streetHeight;
          return streetHeight;
        } else {
          console.log('GroundClamper: No valid 3D Tile samples found');
        }
      }

      // Fallback: try globe terrain
      const center = Cesium.Cartographic.fromDegrees(longitude, latitude);
      const globeHeight = this.globe.getHeight(center);
      if (globeHeight !== undefined && globeHeight !== null && globeHeight > 0) {
        console.log(`GroundClamper: Using globe height = ${globeHeight.toFixed(2)}m`);
        this.lastKnownHeight = globeHeight;
        return globeHeight;
      }

      // Final fallback: use arena configured ground level
      console.log(`GroundClamper: Using arena fallback ground level = ${baselineHeight}m`);
      this.lastKnownHeight = baselineHeight;
      return baselineHeight;

    } catch (e) {
      console.warn('GroundClamper: Initial height probe failed:', e.message);
    }

    console.log('GroundClamper: Using fallback ground level:', this.fallbackGroundLevel);
    this.lastKnownHeight = this.fallbackGroundLevel;
    return this.fallbackGroundLevel;
  }

  clampPosition(cartesianPosition) {
    try {
      const cartographic = Cesium.Cartographic.fromCartesian(cartesianPosition);
      if (!cartographic) return null;

      let targetHeight = null;

      // 1. Single-point sample for stability during movement
      // We rely on the async init to find a good starting plane, but during update we need speed/stability.
      // Multi-point sampling here causes jitter if the tank moves slightly and a new point hits a roof.
      const tileHeight = this.scene.sampleHeight(cartographic, this.excludeEntities, 0.2);
      if (tileHeight !== undefined) {
        targetHeight = tileHeight;
      }

      // 2. Fallback to last known height to prevent dropping into cracks between tiles
      if (targetHeight === null && this.lastKnownHeight !== null) {
        targetHeight = this.lastKnownHeight;
      }

      // 3. Fallback to Globe terrain
      if (targetHeight === null) {
        const globeHeight = this.globe.getHeight(cartographic);
        if (globeHeight !== undefined) {
          targetHeight = globeHeight;
        }
      }

      // 4. Last resort cache
      if (targetHeight === null) {
        targetHeight = this.fallbackGroundLevel;
      }

      // Update cache
      this.lastKnownHeight = targetHeight;

      // Calculate logic height with manual offset
      const finalTargetHeight = targetHeight + this.baseHeight + this.manualOffset;

      // Implement Height Smoothing (Lerp) to prevent jitter/bugging out
      const currentHeight = cartographic.height;
      let nextHeight = finalTargetHeight;

      // Only smooth if the height difference is small (< 5.0m).
      // Large jumps (e.g. falling off a building) should happen instantly to avoid clipping through floor.
      if (Math.abs(finalTargetHeight - currentHeight) < 5.0) {
        // Lerp factor 0.3: Fast enough to feel responsive, slow enough to hide single-frame jitter
        nextHeight = Cesium.Math.lerp(currentHeight, finalTargetHeight, 0.3);
      }

      const newCartographic = new Cesium.Cartographic(
        cartographic.longitude,
        cartographic.latitude,
        nextHeight
      );

      return {
        position: Cesium.Cartographic.toCartesian(newCartographic),
        height: targetHeight + this.manualOffset, // logical height for projectiles
        pitch: 0
      };

    } catch (e) {
      return null;
    }
  }

  getHeightAt(cartesianPosition) {
    // Utility for projectile checks
    const cartographic = Cesium.Cartographic.fromCartesian(cartesianPosition);
    if (!cartographic) return this.fallbackGroundLevel;

    // Single point sample
    const h = this.scene.sampleHeight(cartographic, this.excludeEntities, 0.2);
    if (h !== undefined) return h;

    if (this.lastKnownHeight !== null) return this.lastKnownHeight;

    const gh = this.globe.getHeight(cartographic);
    if (gh !== undefined) return gh;

    return this.fallbackGroundLevel;
  }
}

export { GroundClamper };
