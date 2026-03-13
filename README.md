# GEDnius Proxy Server

A lightweight Node.js proxy that keeps your Anthropic API key secure.
Students never see the key — all requests go through this server.

## How it works

```
Student browser → gednius-proxy (your server) → Anthropic API
                      (API key lives here only)
```

## Deploy to Render (Free — Recommended)

1. Go to https://render.com and create a free account
2. Click **New → Web Service**
3. Connect your GitHub account and upload this folder, OR choose **"Deploy manually"**
4. Settings:
   - **Name:** gednius-proxy
   - **Runtime:** Node
   - **Build Command:** (leave empty)
   - **Start Command:** `node server.js`
5. Under **Environment Variables**, add:
   - Key: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-your-key-here`
6. Click **Deploy**

Render gives you a URL like: `https://gednius-proxy.onrender.com`

## Deploy to Railway (Alternative)

1. Go to https://railway.app
2. New Project → Deploy from GitHub repo (or drag folder)
3. Add environment variable: `ANTHROPIC_API_KEY = your-key`
4. Deploy — Railway gives you a URL automatically

## After Deploying

Update your gednius-app.html, gednius-school.html:
- Open the file in a text editor
- Find: `PROXY_URL = ''`
- Replace with your server URL: `PROXY_URL = 'https://gednius-proxy.onrender.com'`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key (never put this in code) |
| `PORT` | No | Port to run on (default: 3000, Render sets this automatically) |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed origins, e.g. `https://gednius.netlify.app` (default: `*`) |

## Security Notes

- The API key is ONLY in the environment variable on the server
- It never appears in any HTML, JS, or client-side code
- Set `ALLOWED_ORIGINS` to your Netlify URL for extra security
- No database, no user data stored — pure proxy only
