# Kevin6 Toolbox

Four focused, local-first browser tools served at [kevin6.com/toolbox](https://kevin6.com/toolbox/):

- Image Converter — HEIC/HEIF, BMP, TIFF, camera RAW, PNG, JPEG and WebP input; PNG/JPEG/WebP output
- Image Rotate — arbitrary rotation, 90° turns and horizontal/vertical flips
- Image Overlay — drag, scale, rotate, flip and blend a second image
- LAN Transfer — encrypted browser-to-browser text and file transfer with manual WebRTC pairing

No account is required. Image processing happens entirely in the browser.

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
