#!/usr/bin/env node

/**
 * Optimize library thumbnails for the home page.
 * Resizes 800x800 JPGs → 240x240 WebP (quality 80).
 * Input:  public/libraries/thumbs/*.jpg
 * Output: public/libraries/thumbs-opt/*.webp
 *
 * Idempotent: skips files whose WebP already exists and is newer than the source.
 */

import sharp from 'sharp';
import { readdirSync, mkdirSync, statSync, existsSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT_DIR = join(__dirname, '../public/libraries/thumbs');
const OUTPUT_DIR = join(__dirname, '../public/libraries/thumbs-opt');
const SIZE = 240;
const QUALITY = 80;

mkdirSync(OUTPUT_DIR, { recursive: true });

const files = readdirSync(INPUT_DIR).filter(f => extname(f).toLowerCase() === '.jpg');
let processed = 0;
let skipped = 0;

for (const file of files) {
  const input = join(INPUT_DIR, file);
  const output = join(OUTPUT_DIR, basename(file, '.jpg') + '.webp');

  // Skip if output exists and is newer than input
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) {
    skipped++;
    continue;
  }

  await sharp(input)
    .resize(SIZE, SIZE, { fit: 'cover' })
    .webp({ quality: QUALITY })
    .toFile(output);

  processed++;
}

if (processed > 0) {
  console.log(`[optimize-thumbs] ${processed} generated, ${skipped} up-to-date`);
} else {
  console.log(`[optimize-thumbs] All ${skipped} thumbnails up-to-date`);
}
