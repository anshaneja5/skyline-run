# Asset credits

All bundled assets are **CC0 (public domain)** — no attribution required, credited anyway as good practice.

## 3D models (`public/assets/models/`)

| File | Source | Author | License |
| --- | --- | --- | --- |
| `b_small.glb` (Building_Small_1) | [Downtown City MegaKit](https://quaternius.itch.io/downtown-city-megakit) | Quaternius | CC0 1.0 |
| `b_medium.glb` (Building_Medium_2) | [Downtown City MegaKit](https://quaternius.itch.io/downtown-city-megakit) | Quaternius | CC0 1.0 |
| `b_large.glb` (Building_Large_2) | [Downtown City MegaKit](https://quaternius.itch.io/downtown-city-megakit) | Quaternius | CC0 1.0 |
| `prop_ac.glb` (Prop_ACUnit) | [Downtown City MegaKit](https://quaternius.itch.io/downtown-city-megakit) | Quaternius | CC0 1.0 |
| `plane.glb` (SmallPlane) | [Quaternius Airplane Pack (Jan 2017)](https://quaternius.com) | Quaternius | CC0 1.0 |
| `tree1.glb`–`tree3.glb` (CommonTree 1/2/4) | [Stylized Nature MegaKit](https://quaternius.itch.io/stylized-nature-megakit) | Quaternius | CC0 1.0 |
| `bush.glb` (Bush_Common) | [Stylized Nature MegaKit](https://quaternius.itch.io/stylized-nature-megakit) | Quaternius | CC0 1.0 |

Models were optimized for the web with `@gltf-transform/cli` (textures resized to 512px
and converted to WebP) and `FBX2glTF` (plane converted from FBX). The original CC0
license text ships alongside the models as `LICENSE-quaternius.txt`.

## Audio

All sound effects and music are generated procedurally with the Web Audio API — no
audio assets are bundled.

## Data buildings

The contribution towers themselves are procedural geometry (their height encodes real
commit counts), textured with a procedurally generated window facade.
