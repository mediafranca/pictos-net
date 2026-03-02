# PictoNet NLU Schema · v0.0.1

**PictoNet NLU Schema** defines a structured contract between the *Natural Language Understanding (NLU) front-end* and the *SVG compiler* within the [PictoNet](https://pictos.net) ecosystem.  
It encodes communicative intent, semantic roles, logical form, and visual grounding cues — allowing human utterances to be transformed into cognitively accessible pictograms.

## Purpose

This schema formalises how linguistic meaning is represented before being rendered pictographically.  
It bridges complementary traditions in linguistic semantics and visual cognition:

| Layer | Theoretical basis | Schema component |
|-------|-------------------|------------------|
| Speech Act & Intent | Austin · Searle · ISO 24617-2:2020 | `metadata.speech_act`, `metadata.intent` |
| Frame Semantics | Fillmore · FrameNet | `frames[*].roles` |
| Logical Representation | AMR · MRS | `logical_form` |
| Semantic Primes | Wierzbicka · Goddard (NSM) | `nsm_explications` |
| Pragmatics | Brown & Levinson · ISO 24617-2:2020 | `pragmatics` |
| Visual Grounding | Scene Graphs · AAC pictography | `visual_guidelines` |

Each utterance processed through PictoNet’s NLU front-end is serialised as a single JSON object conforming to this schema.  
That object becomes the semantic input for the pictogram compiler, maintaining transparent, reproducible mapping between **text**, **meaning**, and **image**.

## Example

```json
{
  "utterance": "I want you to make the bed",
  "lang": "en",
  "metadata": { "speech_act": "directive", "intent": "request" },
  "frames": [
    {
      "id": "f1",
      "frame_name": "Directed_action",
      "lexical_unit": "make",
      "roles": {
        "Agent": { "type": "Addressee", "ref": "you", "surface": "you" },
        "Theme": { "type": "Object", "lemma": "bed", "surface": "the bed" }
      }
    },
    {
      "id": "f2",
      "frame_name": "Desire",
      "lexical_unit": "want",
      "roles": {
        "Experiencer": { "type": "Speaker", "ref": "I", "surface": "I" },
        "DesiredEvent": { "type": "Event", "ref_frame": "f1" }
      }
    }
  ],
  "nsm_explications": {
    "WANT": "I feel something. I don’t have something. I want it to happen.",
    "DO": "Someone does something.",
    "BED": "Something used for sleeping."
  },
  "logical_form": {
    "event": "make(you, bed)",
    "modality": "want(I, event)"
  },
  "pragmatics": {
    "politeness": "neutral",
    "formality": "informal",
    "expected_response": "compliance"
  },
  "visual_guidelines": {
    "focus_actor": "you",
    "context": "bedroom",
    "temporal": "immediate"
  }
}
```

## Schema Structure

| Field | Description |
|--------|-------------|
| `utterance` | Original text as received |
| `lang` | IETF BCP-47 language tag (e.g. `en`, `en-NZ`, `es-CL`) |
| `metadata` | Speech-act category, intent, optional timestamp and speaker ID |
| `frames` | Array of FrameNet-style frame objects with typed roles |
| `nsm_explications` | Natural Semantic Metalanguage decompositions (preferred key) |
| `NSM_explications` | Legacy alias for backward compatibility (deprecated) |
| `logical_form` | Predicate-style logical representation |
| `pragmatics` | Tone, politeness, formality, and expected response |
| `visual_guidelines` | Cues for layout, salience, and pictogram composition |

The complete formal definition is provided in  
[`pictonet-nlu-1.0.1.schema.json`](pictonet-nlu-1.0.1.schema.json).

## Versioning

This schema follows **semantic versioning**:

- **v1.0.1** — current stable revision  
  - Renamed `nsm_explictations` → `nsm_explications`  
  - Added deprecation notice for `NSM_explications`  
  - Tightened `RoleFiller` constraints  
  - Removed redundant conditional block  

Future minor versions will retain structural compatibility; major revisions may extend or reorganise definitions.

## Licence

Released under the [Creative Commons Attribution 4.0 International (CC BY 4.0)](LICENSE) licence.  
You are free to copy, modify, and redistribute this schema with attribution to  
**[Herbert Spencer González](https://herbertspencer.net)**
