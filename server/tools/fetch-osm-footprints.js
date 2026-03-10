import fs from 'fs';
import https from 'https';

// Arena definitions
const ARENAS = {
  manhattan: {
    south: 40.748,
    west: -73.990,
    north: 40.758,
    east: -73.978
  },
  sf: {
    south: 37.787,
    west: -122.405,
    north: 37.797,
    east: -122.393
  },
  london: {
    south: 51.510,
    west: -0.090,
    north: 51.518,
    east: -0.075
  }
};

// Spawn points for each arena
const SPAWNS = {
  manhattan: [
    { lon: -73.984, lat: 40.753, height: 2 },
    { lon: -73.982, lat: 40.751, height: 2 },
    { lon: -73.986, lat: 40.755, height: 2 },
    { lon: -73.980, lat: 40.754, height: 2 },
    { lon: -73.985, lat: 40.750, height: 2 },
    { lon: -73.988, lat: 40.752, height: 2 },
    { lon: -73.981, lat: 40.756, height: 2 },
    { lon: -73.983, lat: 40.748, height: 2 }
  ],
  sf: [
    { lon: -122.400, lat: 37.792, height: 2 },
    { lon: -122.398, lat: 37.790, height: 2 },
    { lon: -122.402, lat: 37.794, height: 2 },
    { lon: -122.396, lat: 37.793, height: 2 },
    { lon: -122.401, lat: 37.788, height: 2 },
    { lon: -122.404, lat: 37.790, height: 2 },
    { lon: -122.397, lat: 37.795, height: 2 },
    { lon: -122.399, lat: 37.787, height: 2 }
  ],
  london: [
    { lon: -0.083, lat: 51.514, height: 2 },
    { lon: -0.081, lat: 51.512, height: 2 },
    { lon: -0.085, lat: 51.516, height: 2 },
    { lon: -0.079, lat: 51.515, height: 2 },
    { lon: -0.084, lat: 51.510, height: 2 },
    { lon: -0.087, lat: 51.512, height: 2 },
    { lon: -0.080, lat: 51.517, height: 2 },
    { lon: -0.082, lat: 51.509, height: 2 }
  ]
};

function fetchOSMBuildings(bounds) {
  return new Promise((resolve, reject) => {
    const query = `[out:json][timeout:25];
way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});
out geom;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const buildings = parseOSMResponse(json);
          resolve(buildings);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function parseOSMResponse(data) {
  const buildings = [];

  if (data.elements) {
    data.elements.forEach(element => {
      if (element.type === 'way' && element.geometry) {
        const polygon = element.geometry.map(point => [point.lon, point.lat]);
        buildings.push({
          id: element.id,
          polygon: polygon
        });
      }
    });
  }

  return buildings;
}

async function generateArena(arenaName) {
  console.log(`Fetching OSM data for ${arenaName}...`);

  const bounds = ARENAS[arenaName];
  const spawns = SPAWNS[arenaName];

  try {
    const buildings = await fetchOSMBuildings(bounds);

    const arena = {
      id: arenaName,
      name: arenaName.charAt(0).toUpperCase() + arenaName.slice(1),
      bounds: bounds,
      buildings: buildings,
      spawns: spawns
    };

    // Save to file
    const outputPath = `../client/src/arenas/${arenaName}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(arena, null, 2));

    console.log(`Saved ${buildings.length} buildings to ${outputPath}`);
  } catch (error) {
    console.error(`Error fetching ${arenaName}:`, error.message);

    // Create fallback arena without buildings
    const arena = {
      id: arenaName,
      name: arenaName.charAt(0).toUpperCase() + arenaName.slice(1),
      bounds: bounds,
      buildings: [],
      spawns: spawns
    };

    const outputPath = `../client/src/arenas/${arenaName}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(arena, null, 2));
    console.log(`Created fallback arena at ${outputPath}`);
  }
}

// Generate all arenas
async function main() {
  for (const arenaName of Object.keys(ARENAS)) {
    await generateArena(arenaName);
    // Delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Done!');
}

main();
