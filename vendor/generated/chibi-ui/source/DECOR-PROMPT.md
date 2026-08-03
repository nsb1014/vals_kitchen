# Coordinated décor generation prompt

Built with the Codex built-in image generation workflow on 2026-08-02. The two
existing project-generated chibi source sheets were used only as style,
perspective, material-detail, and palette references. The project dedicates the
resulting décor sheet and derived runtime props to CC0.

```text
Use case: stylized-concept
Asset type: coordinated source sheet for a cozy chibi restaurant simulation
Input images: Image 1 is the style, perspective, outline, material-detail, and warm palette reference for furniture; Image 2 is the room-material and palette reference.
Primary request: Create exactly five separate decorative game props together on one source sheet so they share identical proportions and rendering: (1) a medium leafy plant in a warm ceramic floor pot, (2) a small tabletop ceramic vase with a modest bouquet of flowers, (3) a slim freestanding floor lamp with a warm cream fabric shade and wood/brass stand, (4) a small rectangular woven entry rug seen in the same elevated three-quarter perspective, and (5) a freestanding framed chalkboard-style menu sign on a short wooden easel, with no readable writing.
Scene/backdrop: perfectly flat solid #ff00ff chroma-key background for later background removal.
Style/medium: polished high-resolution cozy chibi game illustration, clean dark-brown outlines, hand-painted wood and fabric texture, same elevated three-quarter view and level of detail as the reference furniture. Purpose-made sprite assets, not concept sketches.
Composition/framing: five non-overlapping objects arranged in a single evenly spaced horizontal row, each fully visible with generous flat-magenta padding and clear gutters; objects sit on a shared visual baseline; preserve realistic relative proportions for a room where a character displays at about the height of the referenced kitchen stations.
Lighting/mood: soft neutral studio rendering baked into each object; cozy and warm but no cast shadows.
Color palette: warm walnut, cream, muted terracotta, olive green, restrained gold; do not use magenta within any object.
Constraints: exactly five objects; one instance of each requested prop; opaque simple silhouettes suitable for chroma-key extraction; no overlap; no floor plane; no wall; no surrounding room; no cast shadow; no contact shadow; no reflection; no gradient or texture in the background; no text, letters, numbers, logos, labels, borders, watermark, or UI.
Avoid: pixel art, photorealism, isometric voxel art, miniature illegible details, floating parts, duplicate props, extra objects, decorative clutter, transparent materials, soft glows, magenta spill.
```
