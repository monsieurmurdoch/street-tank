class HUD {
  constructor(tank) {
    this.tank = tank;
    this.elements = {
      healthFill: document.getElementById('health-fill'),
      healthText: document.getElementById('health-text'),
      reloadRing: document.getElementById('reload-ring'),
      killFeed: document.getElementById('kill-feed'),
      playerCount: document.getElementById('player-count'),
      roundTimer: document.getElementById('round-timer')
    };

    this.killFeedEntries = [];

    // Hide timer for now
    if (this.elements.roundTimer) {
      this.elements.roundTimer.style.display = 'none';
    }
  }

  update(deltaTime) {
    this.updateHealth(this.tank.health);
    this.updateReloadIndicator();
    this.cleanupKillFeed();
  }

  updateHealth(health) {
    if (!this.elements.healthFill || !this.elements.healthText) return;

    const percentage = (health / this.tank.maxHealth) * 100;
    this.elements.healthFill.style.width = percentage + '%';
    this.elements.healthText.textContent = Math.ceil(health);

    if (percentage <= 25) {
      this.elements.healthFill.classList.add('low');
    } else {
      this.elements.healthFill.classList.remove('low');
    }
  }

  updateReloadIndicator() {
    if (!this.elements.reloadRing || !this.tank.reloadTime) return;

    const now = performance.now() / 1000;
    const timeSinceFire = now - (this.tank.lastFireTime || 0);
    const reloadProgress = Math.min(timeSinceFire / this.tank.reloadTime, 1);

    if (reloadProgress < 1) {
      this.elements.reloadRing.classList.remove('hidden');
      const dashOffset = 144 * (1 - reloadProgress);
      this.elements.reloadRing.style.strokeDashoffset = dashOffset;
    } else {
      this.elements.reloadRing.classList.add('hidden');
    }
  }

  onFired() {
    if (this.elements.reloadRing) {
      this.elements.reloadRing.classList.remove('hidden');
    }
  }

  addKillFeedEntry(data) {
    if (!this.elements.killFeed) return;

    const entry = document.createElement('div');
    entry.className = 'kill-entry';

    if (data.isSuicide) {
      entry.innerHTML = `<span class="kill-killer">${data.killer || data.killerName || '?'}</span> crashed`;
    } else {
      entry.innerHTML = `<span class="kill-killer">${data.killer || data.killerName || '?'}</span> destroyed <span class="kill-victim">${data.victim || data.victimName || '?'}</span>`;
    }

    this.elements.killFeed.appendChild(entry);

    this.killFeedEntries.push({
      element: entry,
      time: performance.now()
    });

    setTimeout(() => {
      entry.style.opacity = '0';
      setTimeout(() => {
        try { entry.remove(); } catch (e) { /* ignore */ }
      }, 300);
    }, 5000);
  }

  cleanupKillFeed() {
    const now = performance.now();
    this.killFeedEntries = this.killFeedEntries.filter(entry => {
      if (now - entry.time > 6000) {
        try { entry.element.remove(); } catch (e) { /* ignore */ }
        return false;
      }
      return true;
    });
  }

  updatePlayerCount(current, max) {
    if (this.elements.playerCount) {
      this.elements.playerCount.textContent = `${current}/${max}`;
    }
  }
}

export { HUD };
