/**
 * Simplified lobby — no rooms, just pick a name and enter the battle.
 * Auto-connects to server. If server unavailable, falls back to solo mode.
 */
class Lobby {
  constructor(app) {
    this.app = app;
    this.selectedArena = 'manhattan';

    this.adjectives = ['Iron', 'Steel', 'Shadow', 'Thunder', 'Frost', 'Crimson', 'Golden', 'Silver', 'Dark', 'Lightning', 'Atomic', 'Plasma', 'Cyber', 'Neon', 'Stealth', 'Heavy', 'Rapid', 'Savage'];
    this.nouns = ['Tank', 'Wolf', 'Eagle', 'Hawk', 'Tiger', 'Panther', 'Viper', 'Cobra', 'Dragon', 'Phoenix', 'Rhino', 'Scorpion', 'Wraith', 'Specter', 'Reaper', 'Mammoth'];
  }

  async init() {
    this.setupEventListeners();
    document.getElementById('player-name').value = this.generateRandomName();

    // Show connection status
    const status = document.getElementById('connection-status');
    if (status) status.textContent = 'Ready to battle!';
  }

  setupEventListeners() {
    // Arena selection
    document.querySelectorAll('.arena-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.arena-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.selectedArena = card.dataset.arena;
      });
    });

    // Enter battle button
    document.getElementById('enter-btn').addEventListener('click', () => this.enterBattle());
  }

  enterBattle() {
    const playerName = document.getElementById('player-name').value || this.generateRandomName();
    // Pass 'global' as roomId to indicate the open world arena
    this.app.startGame('global', playerName, this.selectedArena);
  }

  generateRandomName() {
    const adj = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
    const num = Math.floor(Math.random() * 99) + 1;
    return `${adj}${noun}${num}`;
  }
}

export { Lobby };
