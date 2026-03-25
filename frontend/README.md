# AnkiPlus Frontend

React-based UI for the AnkiPlus Anki addon.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build (outputs to ../web/)
npm run build:dev    # Development build
```

## Browser Development

The dev server includes mock bridges for testing without Anki. Open `localhost:3000` to develop in the browser.

## Architecture

See [CLAUDE.md](../CLAUDE.md) for full architecture documentation including component list, hooks, design system, and bridge API.

## Component Viewer

Open `localhost:3000/?view=components` during development to browse all UI components with their variants.
