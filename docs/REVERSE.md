# Reverse search

`src/reverse.js` constructs genomes from trait constraints. It does not search a catalogue or sample random seeds.

## Encoding

The 61 genome inputs are 16-bit values packed into a 976-bit integer `c`. For decimal seed `s`:

```text
s = q × 2^976 + r
c = P(r)
seed = q × 2^976 + P⁻¹(c)
```

`P` is a bijection built from xor-right-shifts and multiplication by odd integers modulo `2^976`. Both the encoding and its inverse use `BigInt`; `q` is retained, so the full seed remains part of identity. The encoding layout is part of generator version 2.

## Solving constraints

Scalar constraints become intervals over genome digits. Categorical constraints select weighted intervals. The solver intersects compatible constraints, enumerates finite anatomy choices for discrete counts, and uses bounded numerical fitting for derived geometry such as whole-body aspect and silhouette circularity.

Every result is regenerated through the forward generator and checked against the requested values. Contradictory constraints can return no result; unrepresentable or coupled measurements can return an approximate result. The solver does not guarantee the globally closest result for derived geometry.

`schema().fields` lists supported measurable traits and identifies direct versus derived inversion. A complete genome can be encoded and decoded exactly, but arbitrary combinations of visible measurements are not necessarily realizable.
