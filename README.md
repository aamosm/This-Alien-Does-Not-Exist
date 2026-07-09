<div align="center">

# This Alien Does Not Exist

A procedural alien generator with Infinite<sup>4,294,967,296 </sup> unique aliens.

**Live:** https://thisaliendoesnotexist.app/  
**Devlog:** https://stardance.hackclub.com/projects/29187

</div>

---

## About

This Alien Does Not Exist generates alien creatures entirely from a numerical seed.

There are **no pre-made models, stored creatures, or AI-generated images**. Every alien is generated from scratch from its seed.

The same seed always generates the same alien, giving every creature a permanent, shareable URL that anyone can revisit.

The project explores how complex creatures can emerge entirely from deterministic procedural generation.

---

## Features

- Deterministic generation
- 4,294,967,296 (2³² seeds) unique creatures
- Permanent, shareable URL for every creature
- Procedurally generated anatomy and biological traits
- Browser-based renderer
- No AI or stored assets
- There is an Easter Egg in there... something related to the Mulberry32 limitations<sup>If begun with 0 it only goes upto (2³² - 1)</sup>

**Exactly 4,294,967,296** unique deterministic aliens can be generated.

---

## Example

```text
Seed
000481729513
```

↓

```text
https://thisaliendoesnotexist.app/000481729513
```

Opening that URL will always generate the exact same alien.

---

## How it Works

```text
Seed
   ↓
Genome
   ↓
Morphology
   ↓
Procedural Rendering
   ↓
Alien
```

Each generated genome determines characteristics such as:

- Body plan
- Body mass
- Body proportions
- Limb count
- Limb length
- Head size
- Neck length
- Tail type
- Eye count
- Horn count
- Skin colour
- Behavioural traits

These values are combined to construct and render the final creature entirely from procedural geometry.

---

## Technologies

- JavaScript
- HTML5 Canvas
- Mulberry32 PRNG
- Signed Distance Fields (SDF)
- FABRIK Inverse Kinematics
- Procedural Value Noise

---

## Running Locally

Clone the repository:

```bash
git clone https://github.com/aamosm/This-Alien-Does-Not-Exist.git
cd This-Alien-Does-Not-Exist
```

Start a local server:

```bash
python -m http.server
```

Open:

```text
http://localhost:8000
```

---

## Roadmap

- Better depth and occlusion
- More body plans
- Improved head and eye generation
- More anatomical variation
- Planet and ecosystem generation

---

## License

MIT
