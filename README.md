<div align="center">

# This Alien Does Not Exist

A procedural alien generator with <abbr title="4,294,967,296 unique deterministic aliens (2³²)">Infinite</abbr> unique aliens.

**Live:** https://thisaliendoesnotexist.app/

</div>

---

## About

This Alien Does Not Exist generates alien creatures entirely from a numerical seed.

There are **no pre-made models, stored creatures, or AI-generated images**. Every alien is generated from scratch when you open its seed.

The same seed will always generate the same alien, making every creature permanent and shareable through its own URL.

---

## Features

- Deterministic generation
- <abbr title="4,294,967,296 unique deterministic aliens (2³²)">Infinite</abbr> unique creatures*
- Permanent, shareable URLs for every creature
- Generated biological traits
- Browser-based renderer
- No AI or stored assets

Actually exactly <strong>4,294,967,296</strong> unique deterministic creatures (2³² seeds) exist.

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
Skeleton
   ↓
Procedural Rendering
   ↓
Alien
```

Each generated genome determines characteristics such as:

- Body shape
- Body mass
- Limb count
- Limb length
- Head size
- Neck length
- Tail length
- Eye count
- Horn count
- Skin colour

These values are used to construct the creature before it is rendered entirely from procedural geometry.

---

## Technologies

- JavaScript
- HTML5 Canvas
- Signed Distance Fields (SDF)
- FABRIK Inverse Kinematics
- Mulberry32 PRNG
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

- More anatomical variation
- Better head and eye generation
- Skin patterns and textures
- Species registry

---

## License

MIT
