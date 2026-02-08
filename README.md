# Organomap

A single-page HTML application for building interactive organograms and mind maps.

## Features

- **Infinite Canvas**: Drag background to pan, use mouse wheel or buttons to zoom.
- **Node Management**: Create, move, and connect rectangular nodes.
- **Smart Placement**: New nodes are automatically placed to avoid overlaps.
- **Styling**: Customize background color, border color/width, text color, and font size.
- **Format Painter**: Copy styles between nodes (Single/Double click modes).
- **Import/Export**: Manage your diagrams via JSON (Clipboard support).
- **Custom UI**: Beautiful modern design with custom tooltips and modals.

## How to use

Simply open `index.html` in any modern web browser.

## Built with

- Vanilla JavaScript
- CSS3 (Variables + Flexbox/Grid)
- HTML5 (SVG for connections)

## Regression test suite (E2E)

The production app remains a single file (`index.html`).  
Test infrastructure lives outside the app and does not affect runtime payload.

### Setup

```bash
npm install
npx playwright install --with-deps chromium
```

### Run tests

```bash
npm run test:e2e
```

Useful commands:

```bash
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:update-snapshots
npm run test:e2e:report
```
