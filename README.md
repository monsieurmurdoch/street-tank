# STREET ARMOR

Browser-based multiplayer tank combat game rendered on Google's Photorealistic 3D Tiles using CesiumJS.

## Features

- **Real World Combat**: Battle in photorealistic 3D environments of real cities
- **Multiplayer**: Real-time tank combat with up to 8 players per room
- **Building Collision**: Uses OpenStreetMap building footprints for collision detection
- **3D Terrain**: Tanks follow terrain contours using Google's 3D tiles

## Tech Stack

- **Client**: Vite + CesiumJS + Socket.io-client
- **Server**: Node.js + Socket.io
- **Map Data**: Google Photorealistic 3D Tiles API + OpenStreetMap

## Setup

### Prerequisites

- Node.js 18+
- Google Maps API key with "Map Tiles API" enabled

### Installation

1. Clone the repository

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your Google Maps API key:
```bash
cp .env.example .env
# Edit .env and add your API key
```

4. Start the development server:
```bash
npm run dev
```

This starts both the Vite dev server (port 5173) and the Socket.io server (port 3000).

5. Open your browser to `http://localhost:5173`

## Game Controls

- **W/Arrow Up**: Move forward
- **S/Arrow Down**: Move backward
- **A/Arrow Left**: Turn left
- **D/Arrow Right**: Turn right
- **Mouse**: Aim turret (click to lock pointer)
- **Space/Click**: Fire cannon
- **Tab**: View scoreboard
- **Escape**: Release pointer lock

## Project Structure

```
street-tank/
├── client/               # Frontend application
│   ├── src/
│   │   ├── game/        # Game logic (Tank, Camera, etc.)
│   │   ├── collision/   # Collision detection systems
│   │   ├── network/     # Multiplayer networking
│   │   ├── ui/          # HUD, Lobby, Scoreboard
│   │   └── arenas/      # Arena configurations
│   └── index.html
├── server/              # WebSocket server
│   ├── index.js         # Main server
│   ├── Room.js          # Room management
│   ├── GameState.js     # Authoritative game state
│   └── tools/           # Utility scripts
└── vite.config.js       # Vite configuration
```

## Fetching OSM Building Data

To populate arena building data from OpenStreetMap:

```bash
npm run fetch-osm
```

This fetches building footprints for all configured arenas and saves them as JSON files in `client/src/arenas/`.

## Google Maps API Notes

**Important**: You must enable the "Map Tiles API" for your Google Cloud project.

- As of July 2025, EEA billing accounts cannot access Photorealistic 3D Tiles
- The root tileset request is the billable event
- Attribution must be displayed (handled automatically by CesiumJS)

## Development Milestones

- [x] Phase 1: Single-Player Tank on 3D Tiles
- [x] Phase 2: Combat System
- [x] Phase 3: Multiplayer Networking
- [ ] Phase 4: Polish & Launch

## License

ISC
