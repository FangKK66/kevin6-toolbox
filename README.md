# Kevin6 Toolbox

Five focused, local-first browser tools served at [kevin6.com/toolbox](https://kevin6.com/toolbox/):

- Image Converter — HEIC/HEIF, BMP, TIFF, camera RAW, PNG, JPEG and WebP input; PNG/JPEG/WebP/BMP/TIFF output
- Image Rotate — arbitrary rotation, 90° turns and horizontal/vertical flips
- Image Overlay — drag, scale, rotate, flip and blend a second image
- Pair Transfer — encrypted browser-to-browser transfer for two devices with four-emoji or QR pairing
- Group Transfer — direct encrypted text and file transfer for up to four devices with recipient selection

No account is required. Image processing happens entirely in the browser.

Pair Transfer and Group Transfer use temporary Cloudflare Durable Object rooms for WebRTC signaling only. Text and files travel through encrypted browser-to-browser DataChannels and are not stored by Kevin6. Free Cloudflare STUN discovery is enabled; TURN relay is not used, so restrictive public Wi-Fi networks may block direct connections.

## Local development

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000/toolbox/`.

## Verify

```bash
npm test
npm run lint
```

## GitHub and Cloudflare

Publish this directory as its own GitHub repository named `kevin6-toolbox`.

In Cloudflare Workers & Pages, import that repository and use:

- Production branch: `main`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy --config dist/server/wrangler.json`
- Root directory: `/`

After the first deployment, open the Toolbox Worker → Domains → Add Route and add both routes:

- `kevin6.com/toolbox`
- `kevin6.com/toolbox/*`

Select the existing `kevin6.com` zone. These more-specific Worker routes send only the Toolbox path to this repository; the main `kevin6.com` Worker continues to serve every other path.
