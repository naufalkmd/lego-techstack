# LEGO Tech Stack

Generate a LEGO-inspired tech stack image for a GitHub profile README.

This repo is designed to be fork-friendly:

- Most users only edit `data/techstack.json`.
- `npm run build` writes both `output/lego-techstack.svg` and `output/techstack.manifest.json`.
- `npm run preview` rebuilds first, then starts the local WebGL preview server.
- A GitHub Action can regenerate and commit `output/` automatically when the data changes.

## Quick start

```sh
npm install
npm run build
npm run preview
```

Then open `http://localhost:4173/`.

## Data format

Each category contains a cap brick and a list of tool bricks:

```json
{
  "category": "Frontend & Web",
  "capLabel": "Frontend",
  "capColor": "#2563eb",
  "items": [
    { "label": "React", "color": "#20232a" },
    { "label": "Next.js", "color": "#000000" },
    { "label": "Tailwind", "color": "#06b6d4" }
  ]
}
```

Each item supports these fields:

- `label`: required display name.
- `color`: required brick color.
- `icon`: optional Simple Icons title or slug override.
- `iconPath`: optional local SVG path if you want to supply your own logo.
- `monogram`: optional fallback letters when no logo exists in the automatic resolver.

## Icon resolution order

The build resolves each brick logo in this order:

1. `iconPath`
2. `icon`
3. automatic lookup from `label`
4. monogram fallback

That keeps the default setup low-friction while still allowing custom SVG overrides when a brand is missing.

## README output

Use the generated SVG in your profile README:

```md
<p align="center">
  <img
    alt="LEGO tech stack"
    src="https://raw.githubusercontent.com/<your-user>/lego-techstack/main/output/lego-techstack.svg"
  />
</p>
```

## Local WebGL preview

The preview uses `lego/scene.gltf`, clones the brick per item, projects the category label onto the cap brick, and attaches a generated front badge with the tool logo and name.

Run:

```sh
npm run preview
```

Then open `http://localhost:4173/`.

## GIF export

You can also render a looping disassembly GIF from the WebGL preview:

```sh
npm run gif
```

That writes `output/lego-techstack-disassemble.gif`.

The default export uses a transparent background so you can reuse the animation on dark or light layouts.

Optional overrides:

- `GIF_FRAMES=24 npm run gif`
- `GIF_WIDTH=1600 GIF_HEIGHT=1000 npm run gif`
- `GIF_TRANSPARENT=0 npm run gif`
- `KEEP_GIF_FRAMES=1 npm run gif`

## GitHub Action

The workflow at `.github/workflows/generate-techstack.yml` rebuilds `output/` whenever `data/` or `src/` changes on `main`.

If you fork this repo and keep GitHub Actions enabled, the normal flow is:

1. Edit `data/techstack.json`.
2. Push to `main`.
3. Let the workflow regenerate and commit `output/lego-techstack.svg` and `output/techstack.manifest.json`.
4. Point your profile README at the raw SVG URL.

## Notes

- The static README asset is `output/lego-techstack.svg`.
- The WebGL preview needs internet access because Three.js is loaded from a CDN.
- If an icon cannot be found, the build falls back to a monogram so the stack still renders cleanly.
