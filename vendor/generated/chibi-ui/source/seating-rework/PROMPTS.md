# Seating rework generation prompts

Built with the Codex built-in image generation workflow on 2026-08-01. The
project dedicates these generated assets to CC0. The supplied
`../chef-sheet.png` was the only pre-existing visual reference used for the
style/proportion master; its Val identity was treated as invariant.

## Proportion and cast master

```text
Create one cohesive high-resolution production reference board for a cute
chibi restaurant game. Show Val plus five visually distinct restaurant guests,
and design the matching two-person square cafe table and small backless stools
at the same time so every object shares one proportional system.

Preserve Val's exact recognizable face, very large warm brown-green eyes, small
gentle smile, warm copper-auburn hair color, center-parted braided crown, long
wavy half-up hair shape, hoop earrings, and cream floral dress from the supplied
chef sheet. Create five distinct friendly adults: an elderly silver-bob woman
with round glasses; a young medium-brown-skinned man with short dense curls; a
tan-skinned woman with a long silver braid and teal apron; a dark-skinned man
with shaped black hair, moustache, and mustard vest; and a fair-skinned woman
with a dark-brown bob and blue blouse.

Use one standing height of about 2.75 heads. Show standing fronts, side seated
poses, isolated table/stool assets, and a complete seating vignette. Stools are
small, round, wooden, backless, four-legged, and use a foot ring. Leave a clear
gap for knees and lower legs between stool and table. Match the supplied Val
sheet's polished warm 2D chibi linework and cel shading. Use a perfectly flat
#ff00ff background with no shadows, texture, floor, text, borders, watermark,
cropping, overlap, food, plates, chairs, or chair backs.
```

## Guest animation sheets

The following prompt was run once per approved guest identity from the master.

```text
Create a high-resolution 4-row by 4-column production sprite sheet containing
exactly sixteen full-body frames of the selected guest from the approved master.
Preserve the exact face, skin tone, hair silhouette, expression, outfit, colors,
shoes, chibi proportions, linework, shading, and scale.

Rows: facing down, right, left, up. Columns: neutral idle, first walk contact,
opposite walk contact, seated. Keep identical body/head scale across frames;
walking changes only limbs and a very small bob. Draw authored seated poses on
an invisible backless stool with one hip baseline, roughly 90-degree knees,
visible lower legs and both feet, and relaxed hands. Draw no furniture.

Use the exact approved polished 2D chibi style. Arrange an even 4x4 orthographic
board with generous gutters and full silhouettes. Use a perfectly flat #ff00ff
background with no shadows, floor, text, borders, watermark, props, food,
plates, tables, chairs, stools, duplicate limbs, or cropped body parts.
```

## Furniture sheet

```text
Create a high-resolution 2-row by 4-column restaurant furniture sheet using the
approved master design and scale. Top row: bare two-person walnut table; ready
table with two cream place settings and napkins; occupied table with two simple
covered bowls; dirty table with used plates, cups, and crumbs. Bottom row: the
same small round backless walnut stool viewed down, up, right, and left.

Keep the slim rounded-square tabletop, four tapered legs, subtle wood grain, and
small four-legged foot-ring stool. Table height reaches a seated character's
lower chest; stool seat stays below the hip; preserve an open knee/leg gap at
the game's seat spacing. Match the approved warm, softly inked, clean-cel-shaded
2D chibi style. Use a perfectly flat #ff00ff background with no shadows, floor,
text, borders, watermark, people, full meals, chairs, chair backs, duplicate
legs, overlap, or cropping.
```

## Oval table correction

```text
Create a single-row production sprite sheet of exactly four matching compact
two-person restaurant pedestal tables, using the supplied coordinated chibi
restaurant art as the style and proportion reference. Each tabletop must be a
wide horizontal oval with a smooth continuous edge—no square silhouette and no
corners aimed at the diners. States from left to right: bare/unset; ready with
two cream place settings and napkins centered on the left and right dining
positions; occupied with two covered bowls at those same positions; dirty with
two used plates, cups, and a few crumbs. Keep the same warm walnut, slim top,
central pedestal, and softly inked clean-cel-shaded high-resolution chibi style.
Use one consistent scale and generous transparent-safe gutters. Use a perfectly
flat #ff00ff background with no people, stools, chairs, floor, shadows, text,
borders, watermark, overlap, cropping, or food outside the table states.
```
