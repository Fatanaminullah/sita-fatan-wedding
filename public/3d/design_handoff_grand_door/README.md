# Handoff: Grand Entrance — Animated Door & Chandelier Gallery

## Overview
An interactive 3D scene built with three.js: an ornate stone-arched entrance with animated wooden double doors (open/close), red velvet curtains, and behind it a ~19 m hotel-style gallery hallway with two tiered candelabra chandeliers and a large flush-mount oval crystal chandelier as the focal point at the far end.

## About the Design Files
The files in this bundle are **design references created in HTML/three.js** — a working prototype showing the intended look and behavior, not production code to ship as-is. The task is to **recreate or integrate this scene in the target codebase's environment** (React Three Fiber, vanilla three.js module, game engine, etc.) using its established patterns. If no environment exists yet, plain three.js ES modules (as used here) is a fine choice — the model-building code lifts out directly.

## Fidelity
**High-fidelity 3D prototype.** All geometry, materials, lighting, and the door animation are final-intent. Real-world meters, y-up, origin at the door threshold center. Reference photos the user supplied are approximated: the exterior (stone arch + curtains), the gallery (Ritz-style cream/gold/plum corridor), the candelabra chandeliers, and the flush crystal chandelier (user-approved: "the last chandelier is pretty good, I like it").

## Files
- `grand-door.html` — the entire scene: procedural textures, materials, model construction, animation, UI button. All logic is in one `<script type="module">`.
- `three-d-stage.js` — viewer shell web component (`<three-d-stage>`): renderer, studio lighting, ground shadow, OrbitControls, auto-framed camera, OBJ/GLB export toolbar. Replace with your own scene setup in production; only the model-building and animation code needs porting.
- `grand-door.glb` — (optional, if exported from the viewer toolbar) static snapshot of the model. Note: the crystal-strand cascades use `InstancedMesh`; GLB preserves them, OBJ does not.

three.js is loaded via a pinned import map (v0.184.0, unpkg + SRI hashes) in the HTML `<head>`.

## Scene Structure (THREE.Group `grand_door`)
Key named nodes (names survive GLB export):

- **Facade** — `facade_wall` (extruded shape with arched hole, 5.6×5.3×0.4 m), `arch_molding`, `archivolt`, `pilaster_L/R` + caps/bases, tapered `keystone`, `crest`, `step_upper/lower`, `threshold`.
- **Doors** — `hinge_left` / `hinge_right` (pivot Groups at x = ±0.78, z = −0.15). Each contains `leaf_left`/`leaf_right`: extruded arched slab (spring 2.2 m, arch r 0.78, 60 mm thick) with glass, muntins, raised panels, rosette, bronze lever handles, hinge barrels. **Animation = rotate these two pivots.**
- **Curtains** — `curtain_left/right`: parametric BufferGeometry velvet sheet (56×48 grid, sinusoidal folds pinched at a rope tieback), plus rope/tassel meshes.
- **Hallway** (z −0.4 → −18.9, half-width 1.74 m, ceiling 4.2 m) — carpet floor, cream walls, marble base, 8 bays: cream pilasters + gold-framed plum velvet panels, gold frieze, coffered ceiling with gold-leaf panels (`coffer_gold0..7`), `end_wall` with framed panel.
- **Transom chandelier** — `chandelier` group just inside the door (z −0.75) with warm PointLight `lamp`.
- **Candelabra chandeliers** — `hall_chandelier_3.8` (scale 1.0, y +0.6) and `hall_chandelier_8.6` (scale 0.85, y +0.85). Built by `buildCandelabra(zc, scale, dy)`: brass lathe stem, 3 tiers of curved TubeGeometry arms (12/8/6), glowing pleated shades, crystal teardrops, instanced bead cascade, PointLight. Lowest tip clears ~2.8 m (head height — keep this).
- **Grand crystal chandelier** — `crystal_chandelier` at z −16.9, flush to ceiling: chrome elliptical plate + rim (rx 1.15, rz 1.55), 14 recessed downlight discs, 3 warm PointLights, and 6 concentric elliptical rings of hanging strands (522 rods) with scalloped lengths (`L = (0.55 + (1−s)·1.0) · (1 + 0.13·sin(8a))`), ~8 beads per strand and a crystal ball at each tip — all `InstancedMesh` (3 draw calls).

## Interactions & Behavior
- **Open/close doors**: single toggle button (`#doorBtn`, fixed top-left). Rotates `hinge_left.rotation.y` 0 → +76° and `hinge_right.rotation.y` 0 → −76° (doors swing inward), 1400 ms, cubic ease-in-out, re-entry guarded while animating. Button label swaps "Open the doors" / "Close the doors".
- **Camera**: orbit/zoom/pan via OrbitControls; initial view frontal (direction ≈ (0.28, 0.1, 1) from scene center).

## Materials & Design Tokens
All `MeshStandardMaterial`, shared and named (→ GLB material names). Textures are procedural canvas textures (see `makeTexture` in the HTML — self-contained, no asset files).

- `limestone` #d8d2c4 / `limestoneDark` #bdb5a4 — rough 0.95, stone mottle + joint texture
- `walnut` #b98c5e / `walnutDark` #7a5230 — rough 0.5–0.55, procedural grain + cathedral figure, bump
- `glass` #1c2733 — rough 0.08, metal 0.3, opacity 0.8, warm emissive tint
- `velvet` #a81b24 (curtains, DoubleSide) / `plum` #9a6c90 over quilted texture (wall panels)
- `brass` #d8b25e (metal 0.4) / `bronze` #453723 / `goldTrim` #c9a24a (emissive #6a4c14 ×0.25)
- `goldLeaf` #c9a24a + foil texture, emissiveMap ×0.5 (ceiling coffers)
- `carpet` plum #3a1e30 ground, gold scroll/medallion pattern, repeat 1×6
- `marble` #241a16 with veining / `chrome` #b8bcc4 (metal 0.75, slight emissive — no envmap in viewer)
- `crystal` white, opacity 0.72, emissive #cfdcff ×0.28 / `crystalBall` opacity 0.85, emissive #fff3e0 ×0.5
- `shade` #f3e6cf, emissive #ffd9a0 ×1.0, DoubleSide / `glow` emissive #ffaa40 ×1.6
- `cream` #e9e0cd walls

## Lighting
Viewer shell provides hemisphere + key (shadow-casting) + fill. Scene adds warm PointLights: transom lamp (0xffb050, i7, d5), two hall fill lights (0xffd9a0, i4, d7 at z −5.8/−14.6), one per candelabra (0xffd9a0, i4.5, d6), three in the crystal chandelier (0xfff0d8, i6, d6). Physically-correct decay (~1.6–1.8). If your engine uses an environment map, reduce the compensating `emissive` values on chrome/crystal.

## Performance Notes
Crystal strands/beads/balls and candelabra cascades are `InstancedMesh` — keep instancing when porting (thousands of crystals, a handful of draw calls). Everything else is individual meshes (~500 total).

## Assets
None — all textures are generated in code; no external images or fonts.
