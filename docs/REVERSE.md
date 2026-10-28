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

## Related specimens

Related search edits up to six continuous anatomy inputs before solving the constraints. It preserves the body/head/limb/symmetry family by default; `samePhenotype: false` also varies structural modules. It does not pad results by changing the seed quotient or microscopic detail.

Each ordinary result must be separated from the target and every other result by at least 0.06 squared L2 distance between normalized silhouette descriptors. The descriptors exclude decorative motifs and surface seams. The solver tries at most eight genome constructions per requested result, then returns fewer results if necessary. This is a practical diversity threshold, not a proof of perceptual uniqueness. `diversity` reports skipped duplicates, the threshold and whether the requested count could be filled.

Anatomy similarity combines silhouette overlap with trait distances. Appearance and ecology categories report trait similarity. These are ranking measures, not probabilities or a guarantee of global nearest neighbours.

The regression report in `related-search-audit.json` checks 100 starting specimens, including the reported winged seed, against their constructed relatives. The discovery audit uses 96 fixed silhouette groups and also reports the coarser 40-group diagnostic; groups are a finite visual heuristic, not unique species.

## Internal anatomical variation

The numerical position within a body/head/limb-set choice interval now controls actual shape: mass distribution, torso curvature, head aspect, appendage attachment and bend. Category labels no longer exhaust the information in those digits. Inverse projection transports that relative position when selecting a different category and leaves it intact when the category already matches. Related search varies those positions directly before forward verification. This fixes generation and construction itself; the outline deduplicator remains a secondary guard. No seed permutation or encoding width changed. Existing current-generator pictures change because the geometry interprets more of the genome.