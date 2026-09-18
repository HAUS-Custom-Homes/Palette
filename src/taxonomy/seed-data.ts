/**
 * REF-01 FR-16, the v1 controlled vocabulary.
 *
 * This file seeds the database. Once seeded, the taxonomy lives in
 * taxonomy_facets and taxonomy_terms and is edited there, not here. The
 * designer role (plt-interiors) owns the vocabulary and holds a veto on every
 * term: if the word is wrong, it does not ship.
 *
 * Two kinds of facet:
 *
 *   closed   The model may answer it. Growth happens one way only: the tagger
 *            returns concepts it could not place as unmatched_suggestions,
 *            those land in proposed_terms, and a human promotes them.
 *
 *   open     The model never sees it. Any editor may add a term directly.
 *            Used for things only a person can know, like which haus an
 *            image was saved for. The "Haus" facet is the first of these.
 */

export type SeedFacet = {
  key: string;
  label: string;
  isMulti: boolean;
  /** Any editor may create terms in this facet (a haus, a project). */
  isOpen?: boolean;
  /** The model is shown this facet. False for facets only a person can know. */
  aiTagged?: boolean;
  /** Guidance handed to the model. Shapes the tagging prompt (FR-17). */
  guidance: string;
  terms: Array<{ slug: string; label: string; synonyms?: string[] }>;
};

export const slugify = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const t = (label: string, ...synonyms: string[]) => ({ slug: slugify(label), label, synonyms });

export const SEED_FACETS: SeedFacet[] = [
  {
    key: "project",
    label: "Haus",
    isMulti: true,
    isOpen: true,
    aiTagged: false,
    guidance: "",
    // Empty on purpose. Hauses are added by the team as they come up.
    terms: [],
  },
  {
    key: "image_type",
    label: "Image type",
    isMulti: false,
    guidance:
      "What kind of image this is, not what it depicts. Decide rendering versus real photo carefully: renderings have perfect light, clean edges, no wear, and often slightly plastic materials. Exactly one value.",
    terms: [
      t("Real photo", "photograph", "photo"),
      t("Rendering", "render", "3d", "cgi", "visualization"),
      t("Hand sketch", "sketch", "drawing by hand", "concept sketch"),
      t("CAD or drawing", "cad", "technical drawing", "construction drawing"),
      t("Floor plan", "plan", "layout"),
      t("Elevation", "elevation drawing"),
      t("Detail drawing", "detail", "section"),
      t("Product shot", "product photo", "catalog image"),
      t("Material sample", "swatch", "sample", "finish sample"),
      t("Moodboard or collage", "moodboard", "collage", "board"),
      t("Diagram", "chart", "infographic"),
      t("Screenshot", "screen capture", "screen grab"),
    ],
  },
  {
    key: "space",
    label: "Space",
    isMulti: true,
    guidance:
      "Which room or area of a house is shown. Use primary bath only for a main suite bath. If the space is genuinely unclear, return nothing rather than guessing.",
    terms: [
      t("Kitchen"),
      t("Pantry", "scullery", "butlers pantry"),
      t("Primary bath", "master bath", "owners bath"),
      t("Secondary bath", "guest bath", "hall bath", "kids bath"),
      t("Powder", "powder room", "half bath"),
      t("Mudroom", "drop zone", "boot room"),
      t("Laundry", "laundry room", "utility"),
      t("Primary bedroom", "master bedroom", "owners suite"),
      t("Bedroom", "guest bedroom", "kids room"),
      t("Great room", "living room", "family room"),
      t("Dining", "dining room", "breakfast nook"),
      t("Study", "office", "den", "library"),
      t("Stair", "staircase", "stairwell"),
      t("Hall", "hallway", "entry", "foyer"),
      t("Closet", "wardrobe", "dressing room"),
      t("Garage"),
      t("Wine room", "wine cellar"),
      t("Gym", "home gym", "fitness"),
      t("Exterior front", "front elevation", "curb appeal", "facade"),
      t("Exterior rear", "back of house", "rear elevation"),
      t("Porch", "lanai", "veranda", "covered patio"),
      t("Pool", "spa", "pool deck"),
      t("Outdoor kitchen", "grill station"),
      t("Landscape", "garden", "planting"),
      t("Motor court", "driveway", "auto court"),
    ],
  },
  {
    key: "element",
    label: "Element",
    isMulti: true,
    guidance:
      "The building components actually visible and worth referencing. Tag what a builder would point at. Prefer three to eight of the most prominent rather than everything present.",
    terms: [
      t("Cabinetry", "cabinets", "casework"),
      t("Countertop", "counter", "worktop"),
      t("Backsplash"),
      t("Flooring", "floor"),
      t("Wall finish", "walls"),
      t("Ceiling", "ceiling treatment"),
      t("Millwork", "trim", "moulding", "casing"),
      t("Door", "doors", "entry door"),
      t("Window", "windows", "glazing"),
      t("Stair rail", "railing", "balustrade", "handrail"),
      t("Plumbing fixture", "faucet", "tap", "sink", "shower head"),
      t("Lighting fixture", "light", "sconce", "pendant", "chandelier"),
      t("Hardware", "pulls", "knobs", "hinges"),
      t("Appliance", "range", "refrigerator", "oven"),
      t("Fireplace", "hearth", "surround"),
      t("Tile", "tilework"),
      t("Roof", "roofing"),
      t("Siding", "cladding", "exterior finish"),
      t("Column", "post", "pillar"),
      t("Beam", "beams", "timber"),
      t("Shower", "shower enclosure"),
      t("Tub", "bathtub", "soaking tub"),
      t("Vanity", "bath vanity"),
      t("Island", "kitchen island"),
      t("Range hood", "hood", "vent hood"),
      t("Built-in", "built in", "bookcase", "banquette"),
      t("Paneling", "panelling", "board and batten wall"),
      t("Wainscot", "wainscoting", "chair rail"),
    ],
  },
  {
    key: "material",
    label: "Material",
    isMulti: true,
    guidance:
      "Materials you can actually identify with confidence. Do not guess a stone species from a blurry photo. Plaster and limewash are different finishes, do not conflate them.",
    terms: [
      t("White oak", "oak", "rift sawn oak"),
      t("Walnut"),
      t("Painted wood", "painted cabinetry", "painted mdf"),
      t("Quartzite"),
      t("Marble", "carrara", "calacatta"),
      t("Quartz", "engineered stone"),
      t("Soapstone"),
      t("Granite"),
      t("Porcelain tile", "porcelain"),
      t("Zellige", "handmade tile"),
      t("Cement tile", "encaustic tile"),
      t("Terrazzo"),
      t("Brick", "brickwork"),
      t("Limestone"),
      t("Stucco", "render finish"),
      t("Plaster", "venetian plaster"),
      t("Limewash", "lime wash", "mineral paint"),
      t("Shiplap"),
      t("Board and batten"),
      t("Standing seam metal", "metal roof", "standing seam"),
      t("Cedar shake", "shake", "shingle siding"),
      t("Glass"),
      t("Brass", "unlacquered brass"),
      t("Nickel", "polished nickel", "satin nickel"),
      t("Matte black", "black metal"),
      t("Bronze", "oil rubbed bronze"),
      t("Stainless", "stainless steel"),
    ],
  },
  {
    key: "style",
    label: "Style",
    isMulti: true,
    guidance:
      "Design language. At most two, and only when the image genuinely reads as that style. Style is the facet most prone to over-tagging.",
    terms: [
      t("Modern farmhouse"),
      t("Transitional"),
      t("Contemporary"),
      t("Traditional"),
      t("Mediterranean", "spanish", "spanish revival"),
      t("Coastal", "beach house"),
      t("Mountain modern", "rustic modern"),
      t("Midcentury modern", "mcm", "mid century"),
      t("Tudor"),
      t("Colonial"),
      t("Craftsman"),
      t("Shaker"),
      t("English country"),
      t("Belgian"),
      t("Japandi", "wabi sabi"),
      t("Industrial"),
      t("Minimal", "minimalist"),
    ],
  },
  {
    key: "color",
    label: "Color",
    isMulti: true,
    guidance: "The dominant colors of the space, two to four.",
    terms: [
      t("White"),
      t("Off-white", "cream", "ivory"),
      t("Greige", "taupe", "warm grey"),
      t("Warm wood", "natural wood tone"),
      t("Black"),
      t("Charcoal", "dark grey"),
      t("Navy"),
      t("Blue"),
      t("Green", "sage", "olive"),
      t("Terracotta", "rust", "clay"),
      t("Brass or gold", "gold", "warm metal"),
      t("Mixed", "multicolor"),
    ],
  },
  {
    key: "attribute",
    label: "Attributes",
    isMulti: true,
    guidance:
      "Practical flags about the image itself. client-presentable means it is high enough quality and clean enough to put in front of a homeowner.",
    terms: [
      t("Day", "daylight"),
      t("Night", "evening", "dusk"),
      t("Staged", "styled"),
      t("Watermarked", "watermark"),
      t("Contains people", "people", "person"),
      t("Text overlay", "text on image"),
      t("Low resolution", "low res", "pixelated"),
      t("Client-presentable", "presentation quality"),
    ],
  },
];
