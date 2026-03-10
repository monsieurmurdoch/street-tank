# Deployment Guide - STREET ARMOR

## Quick Deploy to Railway (Recommended for Free Tier)

### 1. Build the project

```bash
npm run build
```

### 2. Deploy to Railway

1. Go to [railway.app](https://railway.app/)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your street-tank repository
4. Railway will auto-detect the Node.js project
5. Click "Deploy"

### 3. Configure Environment Variables

In your Railway project, add these environment variables:

| Variable | Value | Required |
|----------|-------|----------|
| `VITE_GOOGLE_MAPS_API_KEY` | Your Google Maps API key | Yes |
| `NODE_ENV` | `production` | No |

### 4. Get your URL

Railway will give you a URL like `https://your-app.up.railway.app`

That's it! The game is now live.

---

## Alternative: Deploy to Render

### 1. Build the project

```bash
npm run build
```

### 2. Create `render.yaml`

Already included in your project:

```yaml
services:
  - type: web
    name: street-armor
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

### 3. Deploy

1. Go to [render.com](https://render.com/)
2. Click "New" → "Web Service"
3. Connect your GitHub repo
4. Click "Deploy"

---

## Alternative: Deploy to Fly.io

### 1. Install Fly CLI

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Login

```bash
flyctl auth login
```

### 3. Launch

```bash
flyctl launch
```

### 4. Set environment variables

```bash
flyctl secrets set VITE_GOOGLE_MAPS_API_KEY=your_key_here
```

---

## Local Production Test

To test locally before deploying:

```bash
# Build
npm run build

# Start production server
NODE_ENV=production npm start
```

Then open `http://localhost:3000`

---

## Scaling Considerations

### Free Tier Limitations

- **Railway**: ~10 concurrent WebSocket connections
- **Render**: ~10 concurrent WebSocket connections
- **Fly.io**: ~5 concurrent connections on free tier

### If You Grow Beyond Free Tiers

1. **Railway**: Upgrade to $5/mo plan (~50 connections)
2. **Render**: Upgrade to $7/mo plan (~100 connections)
3. **Fly.io**: Add more machines ($3-5/mo each)

For 100+ concurrent players, you'll need:
- At least 2-4 $5/mo dynos
- Or a dedicated VPS ($10-20/mo from DigitalOcean/Linode)

---

## Google Maps API Costs

The **root tileset request** is the billable event for 3D Tiles:
- First ~1000 requests/day are free
- After that: ~$0.50 per 1000 requests

Each player opening the game = 1 root tileset request.

**Estimated costs:**
- 100 players/day = ~$0.05/day = ~$1.50/month
- 1000 players/day = ~$0.50/day = ~$15/month

Monitor your usage at: https://console.cloud.google.com/apis/dashboard

---

## Custom Domain (Optional)

### Railway

1. Go to your project settings
2. Click "Domains"
3. Add your custom domain
4. Update DNS records per Railway's instructions

### Render

1. Go to your service settings
2. Click "Custom Domains"
3. Add your domain and follow DNS instructions
