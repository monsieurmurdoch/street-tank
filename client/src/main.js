import { Game } from './game/Game.js';
import { Lobby } from './ui/Lobby.js';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

class App {
  constructor() {
    this.game = null;
    this.lobby = null;
    this.container = document.getElementById('cesium-container');
  }

  async init() {
    const loadingFill = document.getElementById('loading-fill');
    const loadingText = document.querySelector('.loading-text');

    try {
      loadingText.textContent = 'Loading...';
      loadingFill.style.width = '50%';

      // Initialize lobby
      this.lobby = new Lobby(this);
      await this.lobby.init();

      loadingFill.style.width = '100%';

      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
      }, 400);

    } catch (error) {
      console.error('Initialization error:', error);
      loadingText.textContent = 'Error: ' + error.message;
    }
  }

  /**
   * Start a game. If roomId is null/undefined, runs in solo mode (no server needed).
   */
  async startGame(roomId, playerName, arena) {
    try {
      document.getElementById('lobby-screen').classList.add('hidden');
      document.getElementById('game-container').classList.remove('hidden');

      this.game = new Game(this.container, GOOGLE_MAPS_API_KEY);
      await this.game.init(roomId, playerName, arena);

    } catch (error) {
      console.error('Game start error:', error);
      alert('Failed to start game: ' + error.message);
      document.getElementById('lobby-screen').classList.remove('hidden');
      document.getElementById('game-container').classList.add('hidden');
    }
  }

  returnToLobby() {
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    document.getElementById('game-container').classList.add('hidden');
    document.getElementById('scoreboard').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window.STREET_ARMOR = app;
});

export { App };
