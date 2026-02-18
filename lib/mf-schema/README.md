# MediaFranca SVG Schema

**A formal specification for semantically rich, accessible SVG pictograms in Augmentative and Alternative Communication**

## Overview

The MediaFranca SVG Schema defines a standard for AAC pictograms that function as **Single Sources of Truth (SSoT)**. Each SVG file encapsulates not only visual geometry but also:

- Natural Language Understanding (NLU) analysis. <br>*Check the **[nlu-schema](https://github.com/mediafranc/nlu-schema)** repository.*
- Semantic role mappings (Agent, Patient, Action, etc.)
- Human-in-the-loop validation data (VCSCI). <br>*Check the **[VCSCI](https://github.com/mediafranc/VCSCI)** repository.*
- Comprehensive accessibility metadata for screen readers and high-contrast rendering

## Philosophy

Traditional icon sets separate visual assets from their semantic intent. The MediaFranca approach integrates these layers within a single, portable SVG file, ensuring that assistive technologies, generative models, and human curators all access the same canonical information.

### The Single Source of Truth Principle

In standard systems, a pictogram's meaning is often stored in a separate database, whilst its visual representation lives in an image folder and its accessibility description is hard-coded into a website's HTML. This fragmentation leads to "data rot"—where the image and its meaning become desynchronised.

By adopting SSoT, the SVG file contains the **entire chain of thought**:

* **The Intent:** What the user wanted to say.
* **The Logic:** How the generative model (PictoNet) decomposed that intent (NLU).
* **The Visuals:** The geometry (SVG paths) that represents those concepts.
* **The Validation:** The human audit (VCSCI) that proves the pictogram is effective.

### Core Principles

#### 1. Unified Intelligence

The SVG file is not merely a drawing—it is an intelligent document that encapsulates linguistic, conceptual, structural, and evaluative layers within a single, cohesive artefact.

#### 2. Semantic Geometry

We believe that the **structure of the drawing should mirror the structure of the thought.** If a sentence has a subject (Agent) and an object (Patient), the SVG DOM must have corresponding groups (`<g>`) with those specific roles.

This makes the drawing "machine-readable" in a linguistic sense. A screen reader or an AAC device doesn't just see "an image of a person making a bed"; it sees a structured relationship where the **Agent** is acting upon the **Patient**.

#### 3. Radical Portability

Because the SVG is the SSoT, it is **platform-agnostic.** You can move a MediaFranca pictogram from a web app to a mobile device, or even an offline communication board, and it carries its intelligence with it.

* If a system needs to display it in **High Contrast**, the instructions are already inside the CSS definitions within the file.
* If an assistive technology needs to **narrate** the image, the cognitive and visual descriptions are embedded in the `<metadata>` and `<desc>` tags.

#### 4. Deterministic Accessibility

In cognitive accessibility, ambiguity is the enemy. By formalising the metadata and the DOM, we eliminate the guesswork for assistive software. The SSoT ensures that every time this pictogram is rendered, it provides a **consistent, validated, and accessible experience** for the end-user, regardless of the interface.

#### 5. Cognitive Accessibility

Structures prioritise clarity, predictability, and semantic richness to assist users with diverse cognitive needs, ensuring that the pictogram serves its communicative purpose effectively.

### The SSoT Layers

| Layer | Component | Function |
| --- | --- | --- |
| **Linguistic** | `metadata > utterance` | Defines the original communicative goal. |
| **Conceptual** | `metadata > nsm / concepts` | Maps the geometry to human-primitive meanings. |
| **Structural** | `svg > g[role="group"]` | Organises the visual elements into a semantic hierarchy. |
| **Visual** | `svg > path / circle` | The actual drawing, governed by internal styles (`.f`, `.k`). |
| **Evaluative** | `metadata > vcsci` | Records the human "seal of approval" for cognitive clarity. |

### Key Features

- **Explicit and Implicit Concepts**: Actions may be explicit (with dedicated SVG groups) or implicit (performed through an Agent's posture)
- **Semantic Role Mappings**: Agent, Patient, Action, Instrument, Location, and more
- **NSM Integration**: Maps visual concepts to universal semantic primes
- **VCSCI Validation**: Human-in-the-loop quality assurance with clarity scoring
- **Full Accessibility**: ARIA roles, keyboard navigation, high-contrast support, and screen reader compatibility
- **Platform Independence**: Self-contained SVG files with embedded styles and metadata

## Repository Structure

```text
mediafranca-svg-schema/
├── .github/                 # CI/CD for validation
├── schemas/                 # Formal definitions
│   ├── metadata.schema.json # JSON Schema for the <metadata> block
│   └── styles.css           # Base CSS for .f (foreground) and .k (key/contrast)
├── examples/                # Canonical references
│   └── canonical.svg        # The gold-standard implementation
├── docs/                    # Detailed specifications (British English)
│   ├── specification.md     # The main technical standard
│   ├── nlu-mapping.md       # Integration with mediafranca/nlu-schema
│   └── accessibility.md     # Cognitive and visual accessibility guidelines
├── tools/                   # Utility scripts
│   └── validator.py         # Python tool to validate SVG against this schema
├── LICENSE                  # CC BY 4.0
└── README.md                # Project overview and usage
```

## Quick Start

See [`examples/canonical.svg`](examples/canonical.svg) for a reference implementation demonstrating:

- Explicit concepts (Agent, Patient) with corresponding SVG groups
- Implicit Action performed by the Agent through body posture
- Proper z-index layering for visual depth
- Complete metadata with NLU analysis and VCSCI validation

Validate your SVG files:

```bash
python tools/validator.py your-pictogram.svg
```

## Documentation

- [Technical Specification](docs/specification.md) — Detailed requirements for namespaces, attributes, and the CSS class system
- [NLU Integration](docs/nlu-mapping.md) — How this schema integrates with the MediaFranca NLU pipeline
- [Accessibility Guidelines](docs/accessibility.md) — Cognitive and visual accessibility best practices

## Role within the MediaFranca Architecture

The MediaFranca SVG Schema serves as the terminal output specification for the broader MediaFranca AAC ecosystem, which includes:

1. **NLU Schema** — Natural language understanding and semantic decomposition
2. **PictoNet** — Generative model for pictogram synthesis
3. **SVG Schema (this repository)** — Formal specification for the final, portable artefact
4. **VCSCI Framework** — Human-in-the-loop validation and quality assurance

## Licence

This specification is released under [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE).

## Contributing

Contributions are welcome. Please ensure all proposals align with the SSoT philosophy and maintain deterministic accessibility. See `docs/specification.md` for technical requirements.
