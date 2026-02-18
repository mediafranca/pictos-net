# VCSCI Toy Example: Complete Chain of Thought

This directory contains two complementary examples demonstrating the complete VCSCI pipeline:

1. **Basic Example**: "I want to go to the toilet" (req-001) - Shows the core flow
2. **Canonical Example**: "Make the bed" - Shows best practices with perfect scores

Both demonstrate the complete flow from utterance to evaluated pictogram with embedded metadata as single source of truth.

## The Flow

```
1. Input: Phrase + Style Profile
   ↓
2. Generate: Create SVG pictogram
   ↓
3. Evaluate: Human rates with hexagonal interface
   ↓
4. Embed: Metadata becomes SSOT in SVG
   ↓
5. Store: Atomic unit (SVG + metadata)
```

## Files in This Example

```
toy-example/
├── README.md                   (this file)
├── cases/
│   └── req-001_v1.0.0_default-v1_01.json    # Case definition
└── pictograms/
    └── req-001_v1.0.0_default-v1_01/
        ├── output.svg          # SVG with embedded metadata
        └── metadata.json       # Sidecar metadata (SSOT)
```

## Step-by-Step Walkthrough

### Step 1: Input Definition

**Phrase**: "Quiero ir al baño." / "I want to go to the toilet."

**Style Profile**: `default-v1` (minimalist, high-contrast)

**Pipeline**: `v1.0.0`

See: [cases/req-001_v1.0.0_default-v1_01.json](cases/req-001_v1.0.0_default-v1_01.json)

### Step 2: Generation

Model generates SVG based on:
- Phrase semantic content
- Style profile parameters
- Pipeline configuration

**Result**: `pictograms/req-001_v1.0.0_default-v1_01/output.svg`

### Step 3: Evaluation

Evaluator uses hexagonal interface to rate 6 dimensions:

| Dimension | Score | Notes |
|-----------|-------|-------|
| Clarity | 4 | Good contrast, clean lines |
| Recognizability | 5 | Immediately clear: person + toilet |
| Semantic Transparency | 4 | Captures "need" and "location" |
| Pragmatic Fit | 5 | Highly useful for AAC |
| Cultural Adequacy | 4 | Appropriate representation |
| Cognitive Accessibility | 5 | Simple, no unnecessary detail |

**VCSCI Score**: 4.5/5.0

**Decision**: Accept

### Step 4: Metadata Embedding

The evaluation results are embedded in the SVG:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"
     data-case-id="req-001_v1.0.0_default-v1_01"
     data-vcsci-score="4.50"
     data-decision="accept"
     data-vcsci-certified="true">

  <metadata>
    <vcsci:metadata xmlns:vcsci="https://vcsci.org/schema/v1">
      <![CDATA[
      {
        "vcsci": {
          "version": "1.0.0",
          "case_id": "req-001_v1.0.0_default-v1_01",
          "chain_of_thought": {
            "1_input": { ... },
            "2_generation": { ... },
            "3_evaluation": { ... },
            "4_provenance": { ... }
          }
        }
      }
      ]]>
    </vcsci:metadata>
  </metadata>

  <!-- SVG content -->
  <g id="pictogram">
    <!-- Simplified toilet pictogram -->
    <circle cx="200" cy="150" r="40" fill="#2c3e50"/>
    <rect x="160" y="200" width="80" height="120" fill="#2c3e50" rx="10"/>
    <rect x="330" y="250" width="80" height="120" fill="#95a5a6" rx="5"/>
    <ellipse cx="370" cy="360" rx="50" ry="20" fill="#95a5a6"/>
  </g>
</svg>
```

### Step 5: Storage

The SVG is now a **certified atomic unit** with:
- ✅ Visual representation (the pictogram)
- ✅ Complete provenance (chain of thought)
- ✅ Quality certification (evaluation scores)
- ✅ Self-contained truth (embedded metadata)

## Using This Example

### 1. Validate the Chain

```bash
cd ../..  # Return to project root
node scripts/validate-chain.js --all
```

### 2. Extract Metadata

```bash
# View embedded metadata
node scripts/extract-metadata.js req-001_v1.0.0_default-v1_01

# Or just read the sidecar
cat examples/toy-example/pictograms/req-001_v1.0.0_default-v1_01/metadata.json
```

### 3. View the Pictogram

Open `output.svg` in a browser or SVG viewer. The metadata travels with it!

### 4. Query the SSOT

```javascript
// In your application
const metadata = extractMetadataFromSVG('output.svg');

console.log('VCSCI Score:', metadata.vcsci.chain_of_thought['3_evaluation'].vcsci_score);
console.log('Decision:', metadata.vcsci.chain_of_thought['3_evaluation'].decision);
console.log('Certified:', metadata.vcsci.chain_of_thought['3_evaluation'].decision === 'accept');
```

## Key Insights from This Example

### 1. Atomic Unit

The SVG + metadata is **one indivisible unit**:
- Can be copied, shared, archived
- Metadata never gets separated
- Complete provenance always available

### 2. Single Source of Truth

There's no ambiguity about which metadata is correct:
- Embedded in SVG = authoritative
- Sidecar JSON = convenient copy
- Both should always match

### 3. Chain of Thought Visibility

Every node in the chain is documented:
1. **Input**: What we asked for
2. **Generation**: How it was made
3. **Evaluation**: What we think of it
4. **Provenance**: When and by whom

### 4. Production Readiness

The `data-vcsci-certified="true"` attribute signals:
- This pictogram has been evaluated
- It received an "accept" decision
- It's ready for production use

## Extending This Example

### Add an Iteration

If we wanted to improve this pictogram:

1. Create new case: `req-001_v1.0.0_default-v1_02`
2. Reference parent: `"parent_case_id": "req-001_v1.0.0_default-v1_01"`
3. Document required edits in metadata
4. Generate improved version
5. Re-evaluate
6. Compare scores: v01 vs v02

### Compare Style Profiles

Generate same phrase with different styles:
- `req-001_v1.0.0_default-v1_01`
- `req-001_v1.0.0_simplified-v1_01`
- `req-001_v1.0.0_colorful-v1_01`

Compare VCSCI scores to see which style works best.

### Aggregate Analysis

Collect 20-30 cases, all with embedded metadata:
- Extract evaluation scores
- Compute aggregate VCSCI
- Generate hexagonal comparison chart
- Identify patterns (which dimensions are weakest?)

## Real-World Application

In production:

1. **Generation Pipeline**: Automatically embeds metadata
2. **Review Interface**: Displays hexagon, loads from embedded metadata
3. **Deployment**: Only copies SVGs with `data-vcsci-certified="true"`
4. **Monitoring**: Tracks aggregate scores over time
5. **Archive**: SVGs carry their own provenance forever

## Questions?

See the full documentation:
- [Metadata Embedding Guide](../../docs/metadata-embedding.md)
- [Hexagonal Interface](../../docs/hexagonal-interface.md)
- [Pictogram Case Definition](../../docs/pictogram-case.md)
