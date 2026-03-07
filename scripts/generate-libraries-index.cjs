#!/usr/bin/env node

/**
 * Generate libraries index from public/libraries/*.json
 * This script creates an index.json file listing all available libraries with their metadata
 */

const fs = require('fs');
const path = require('path');

const LIBRARIES_DIR = path.join(__dirname, '..', 'public', 'libraries');
const THUMBS_DIR = path.join(LIBRARIES_DIR, 'thumbs');
const INDEX_FILE = path.join(LIBRARIES_DIR, 'index.json');
const THUMBS_PER_LIBRARY = 3;

function generateThumbs(filename, data) {
  const slug = filename.replace(/(_graph.*)?\.json$/, '');
  const existing = Array.from({ length: THUMBS_PER_LIBRARY }, (_, i) =>
    path.join(THUMBS_DIR, `${slug}_${i}.jpg`)
  );

  if (existing.every(f => fs.existsSync(f))) return;

  const withBitmap = (data.rows || []).filter(r => r.bitmap);
  if (withBitmap.length === 0) return;

  fs.mkdirSync(THUMBS_DIR, { recursive: true });

  const indices = withBitmap.length < THUMBS_PER_LIBRARY
    ? withBitmap.map((_, i) => i)
    : [0, Math.floor(withBitmap.length / 2), withBitmap.length - 1];

  indices.forEach((idx, i) => {
    const base64 = withBitmap[idx].bitmap.replace(/^data:image\/\w+;base64,/, '');
    const outPath = path.join(THUMBS_DIR, `${slug}_${i}.jpg`);
    fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  });

  console.log(`  🖼️  Generated ${indices.length} thumbnails for ${slug}`);
}

async function generateIndex() {
  try {
    const files = fs.readdirSync(LIBRARIES_DIR)
      .filter(file => file.endsWith('.json') && file !== 'index.json');

    console.log(`📚 Found ${files.length} libraries`);

    const libraries = files.map(filename => {
      try {
        const filepath = path.join(LIBRARIES_DIR, filename);
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

        generateThumbs(filename, data);

        const metadata = {
          filename,
          name: data.config?.name || data.config?.author || filename.replace('.json', ''),
          location: data.config?.geoContext?.region || 'Unknown',
          language: data.config?.lang || 'es',
          items: data.rows?.length || 0,
          description: data.type || 'PictoNet library',
          filesize: fs.statSync(filepath).size
        };

        console.log(`  ✅ ${filename} - ${metadata.items} items (${metadata.name})`);
        return metadata;
      } catch (err) {
        console.error(`  ❌ Failed to process ${filename}:`, err.message);
        return null;
      }
    }).filter(Boolean);

    const index = {
      generated: new Date().toISOString(),
      count: libraries.length,
      libraries
    };

    fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
    console.log(`\n✅ Generated index.json with ${libraries.length} libraries`);

  } catch (err) {
    console.error('❌ Error generating libraries index:', err);
    process.exit(1);
  }
}

generateIndex();
