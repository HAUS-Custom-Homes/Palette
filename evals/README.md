# The golden set (REF-01 FR-18)

Two hundred images the designer has labelled by hand, and the only thing that decides whether
a model's tags are applied or merely suggested. Until `npm run eval` has recorded a pass for a
facet, that facet's tags render dashed, land in review, and are not used for filtering.

## Layout

```
evals/golden/labels.csv     one row per image per facet (committed)
evals/golden/*.jpg          the images (gitignored: they are HAUS reference material)
```

`labels.csv`:

```
file,facet,terms
kitchen-01.jpg,image_type,real photo
kitchen-01.jpg,space,kitchen
kitchen-01.jpg,element,island|range hood|cabinetry
kitchen-01.jpg,material,white oak|marble|brass
kitchen-01.jpg,style,transitional
```

Terms are slugs or labels from the vocabulary; `white oak` and `white-oak` both work. Leave a
facet out when the image genuinely has no answer for it. At least 20 labelled images per facet
are needed before a facet can pass.

## Labelling well

- Label what is *there*, not what the model would say. The point is to catch the model.
- Include the hard cases on purpose: renderings that look real, plaster next to limewash,
  a powder room that could pass for a primary bath. A golden set of easy images passes a bad
  model.
- Do not look at the model's tags before labelling.

## Running

```bash
npm run eval -- --dry     # score, record nothing
npm run eval              # score and record: facet_gates decides what gets applied
```

Re-run on every prompt change, every taxonomy change, and every model change. Each run leaves
`docs/evals/RUN-<date>-<model>.md` so the trend is visible.

## Escape hatch

`PALETTE_TRUST_UNGATED=1` applies every facet regardless. It exists for a library that has
decided to live with unmeasured tags, and the UI says so while it is on.
