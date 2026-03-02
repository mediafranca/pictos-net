#!/bin/bash
# Copy schema data to public directory for build
# This script is run as part of the build process

echo "Copying schema data to public directory..."

# Create directories
mkdir -p public/schemas/ICAP/data
mkdir -p public/schemas/nlu-schema
mkdir -p public/schemas/mf-svg-schema
mkdir -p public/libraries

# Copy ICAP data (evaluation rubric) - optional, app works without it
if [ -f "schemas/ICAP/data/rubric-scale-descriptions.json" ]; then
    cp schemas/ICAP/data/rubric-scale-descriptions.json public/schemas/ICAP/data/
    echo "ICAP rubric descriptions copied"
fi

# Generate libraries index
if [ -d "public/libraries" ]; then
    node scripts/generate-libraries-index.cjs
fi

echo "Schema data copy complete"
