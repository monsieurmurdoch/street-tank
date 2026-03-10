class Scoreboard {
  constructor() {
    this.element = document.getElementById('scoreboard');
    this.body = document.getElementById('scoreboard-body');
    this.isVisible = false;

    this.scores = new Map();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Toggle with Tab key
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Hide when Tab is released
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Tab') {
        this.hide();
      }
    });
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.isVisible = true;
    this.element.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.isVisible = false;
    this.element.classList.add('hidden');
  }

  updateScore(playerId, stats) {
    this.scores.set(playerId, {
      kills: stats.kills || 0,
      deaths: stats.deaths || 0,
      name: stats.name || 'Unknown'
    });

    if (this.isVisible) {
      this.render();
    }
  }

  removePlayer(playerId) {
    this.scores.delete(playerId);
    if (this.isVisible) {
      this.render();
    }
  }

  render() {
    if (!this.body) return;

    this.body.innerHTML = '';

    // Sort by kills, then by K:D ratio
    const sorted = Array.from(this.scores.entries())
      .map(([id, stats]) => ({
        id,
        ...stats,
        kd: stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2)
      }))
      .sort((a, b) => {
        if (b.kills !== a.kills) return b.kills - a.kills;
        return parseFloat(b.kd) - parseFloat(a.kd);
      });

    sorted.forEach((player, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${player.name}</td>
        <td>${player.kills}</td>
        <td>${player.deaths}</td>
        <td>${player.kd}</td>
      `;

      // Highlight leader
      if (index === 0 && player.kills > 0) {
        row.style.color = '#ffd700';
      }

      this.body.appendChild(row);
    });
  }

  reset() {
    this.scores.clear();
    if (this.isVisible) {
      this.render();
    }
  }
}

export { Scoreboard };
