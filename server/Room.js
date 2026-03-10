import { nanoid } from 'nanoid';

class Room {
  constructor(creatorId, creatorName, arena) {
    this.code = this.generateCode();
    this.creatorId = creatorId;
    this.arena = arena;
    this.players = [{
      id: creatorId,
      name: creatorName,
      isReady: false
    }];
    this.createdAt = Date.now();
  }

  generateCode() {
    // Generate 4-character uppercase code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  addPlayer(player) {
    if (this.players.length >= 16) {
      return false;
    }
    this.players.push(player);
    return true;
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
  }

  hasPlayer(playerId) {
    return this.players.some(p => p.id === playerId);
  }

  getPlayers() {
    return this.players.map(p => ({
      id: p.id,
      name: p.name,
      isReady: p.isReady
    }));
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(creatorId, creatorName, arena) {
    const room = new Room(creatorId, creatorName, arena);
    this.rooms.set(room.code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  getAllRooms() {
    return Array.from(this.rooms.values());
  }
}

export { Room, RoomManager };
