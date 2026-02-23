# Style Profiles

This directory contains style profile definitions for pictogram generation.

## What is a Style Profile?

A style profile defines the visual characteristics and generation parameters for pictograms:

- Visual style (minimalist, detailed, colorful, monochrome)
- Drawing technique (line art, flat design, sketch)
- Prompt templates and instructions
- Model-specific parameters
- Output specifications (size, format, etc.)

## File Format

Style profiles are defined in JSON format and include:

```json
{
  "style_profile_id": "default-v1",
  "version": "1.0.0",
  "name": "Default Style v1",
  "description": "Clean, minimalist pictograms with high contrast",
  "visual_characteristics": {
    "style": "minimalist",
    "colors": "high-contrast",
    "complexity": "simple",
    "line_weight": "medium"
  },
  "prompt_template": "Create a simple, clear pictogram representing: {phrase}...",
  "parameters": {
    "size": "512x512",
    "format": "svg"
  }
}
```

## Versioning

Style profiles follow semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Fundamental visual changes (e.g., sketch → flat design)
- **MINOR**: Refinements to existing style (e.g., adjusted colors)
- **PATCH**: Bug fixes or documentation updates

The `style_profile_id` includes the version for tracking:
- `default-v1`, `default-v2`, `default-v3`
- `simplified-v1`, `simplified-v2`
- `colorful-v1`

## Available Profiles

- [default-v1.json](default-v1.json) - Default minimalist style
- [simplified-v1.json](simplified-v1.json) - Extra simplified for cognitive accessibility
- [colorful-v1.json](colorful-v1.json) - High-color variant

## Usage

Reference the `style_profile_id` in case metadata:

```json
{
  "case_id": "req-001_v1.0.0_default-v1_01",
  "style_profile_id": "default-v1",
  ...
}
```

## Creating a New Profile

1. Copy an existing profile
2. Assign a new `style_profile_id`
3. Update `version`, `name`, and `description`
4. Modify `visual_characteristics` and `prompt_template`
5. Document changes in this README
