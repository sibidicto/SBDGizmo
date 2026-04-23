# GLB Gizmo Viewer

A minimal web viewer for `model.glb` with a custom gizmo matching the reference:

- three axis-colored rings for `X/Y/Z`
- a screen-facing outer circle
- axis arrows
- click-to-place gizmo on the mesh surface

## Run

From the project folder:

```powershell
py -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Files

- `index.html` - page shell
- `main.js` - `model.glb` loading, scene setup, gizmo rendering
- `styles.css` - page styling and HUD

## Note

`three.js` is loaded from a CDN, so the first run needs internet access.
