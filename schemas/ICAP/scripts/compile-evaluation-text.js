#!/usr/bin/env node

/**
 * Compile Evaluation Text
 *
 * Compiles evaluation scores into narrative paragraphs using
 * the rubric scale descriptions.
 *
 * Usage:
 *   node scripts/compile-evaluation-text.js --scores 5,3,3,4,5,4
 *   node scripts/compile-evaluation-text.js --case req-001_v1.0.0_default-v1_01
 *   node scripts/compile-evaluation-text.js --file path/to/rating.json
 *
 * Options:
 *   --scores <list>        Comma-separated scores (clarity,recognizability,semantic,pragmatic,cultural,cognitive)
 *   --case <case_id>       Load scores from case evaluation
 *   --file <path>          Load scores from rating file
 *   --lang <es|en>         Output language (default: es)
 *   --format <text|html>   Output format (default: text)
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const scoresArg = getArg('--scores');
const caseId = getArg('--case');
const filePath = getArg('--file');
const lang = getArg('--lang') || 'es';
const format = getArg('--format') || 'text';

// Load rubric descriptions
const rubricPath = path.join(__dirname, '../data/rubric-scale-descriptions.json');
if (!fs.existsSync(rubricPath)) {
  console.error('Error: rubric-scale-descriptions.json not found');
  process.exit(1);
}

const rubric = JSON.parse(fs.readFileSync(rubricPath, 'utf8'));

// Dimension order
const dimensions = [
  'clarity',
  'recognizability',
  'semantic_transparency',
  'pragmatic_fit',
  'cultural_adequacy',
  'cognitive_accessibility'
];

// Get scores
let scores = null;

if (scoresArg) {
  scores = parseScores(scoresArg);
} else if (caseId) {
  scores = loadScoresFromCase(caseId);
} else if (filePath) {
  scores = loadScoresFromFile(filePath);
} else {
  console.error('Error: Must provide --scores, --case, or --file');
  console.log('\nUsage:');
  console.log('  node scripts/compile-evaluation-text.js --scores 5,3,3,4,5,4');
  console.log('  node scripts/compile-evaluation-text.js --case req-001_v1.0.0_default-v1_01');
  console.log('  node scripts/compile-evaluation-text.js --file path/to/rating.json');
  process.exit(1);
}

// Validate scores
if (!scores || scores.length !== 6) {
  console.error('Error: Must provide exactly 6 scores');
  process.exit(1);
}

// Compile evaluation text
const evaluation = compileEvaluation(scores, lang, format);
console.log(evaluation);

// Helper functions

function getArg(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index < args.length - 1 ? args[index + 1] : null;
}

function parseScores(scoresStr) {
  return scoresStr.split(',').map(s => {
    const score = parseInt(s.trim(), 10);
    if (isNaN(score) || score < 1 || score > 5) {
      console.error(`Error: Invalid score "${s}". Must be 1-5.`);
      process.exit(1);
    }
    return score;
  });
}

function loadScoresFromCase(caseId) {
  const casePath = path.join(__dirname, `../cases/${caseId}.json`);
  if (!fs.existsSync(casePath)) {
    console.error(`Error: Case file not found: ${casePath}`);
    process.exit(1);
  }

  const caseData = JSON.parse(fs.readFileSync(casePath, 'utf8'));

  // Extract mean scores from ratings
  if (!caseData.ratings || !caseData.ratings.length) {
    console.error('Error: Case has no ratings');
    process.exit(1);
  }

  // Use first rating
  const rating = caseData.ratings[0];

  return dimensions.map(dim => {
    const score = rating[dim];
    if (typeof score !== 'number' || score < 1 || score > 5) {
      console.error(`Error: Invalid score for ${dim}: ${score}`);
      process.exit(1);
    }
    return score;
  });
}

function loadScoresFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return dimensions.map(dim => {
    const score = data[dim];
    if (typeof score !== 'number' || score < 1 || score > 5) {
      console.error(`Error: Invalid score for ${dim}: ${score}`);
      process.exit(1);
    }
    return score;
  });
}

function compileEvaluation(scores, lang, format) {
  const textKey = lang === 'en' ? 'text_en' : 'text';
  const nameKey = lang === 'en' ? 'name' : 'name_es';

  const paragraphs = [];

  dimensions.forEach((dim, index) => {
    const score = scores[index];
    const dimData = rubric.dimensions[dim];
    const levelData = dimData.levels[score.toString()];

    const dimName = dimData[nameKey];
    const text = levelData[textKey];

    if (format === 'html') {
      paragraphs.push(`<p><strong>${dimName}:</strong> ${text}</p>`);
    } else {
      paragraphs.push(`**${dimName}**: ${text}`);
    }
  });

  // Add summary
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const scaleLabel = rubric.scale[Math.round(avgScore).toString()];
  const summaryLabel = lang === 'en' ? scaleLabel.label_en : scaleLabel.label;
  const summaryText = lang === 'en' ? scaleLabel.general_en : scaleLabel.general;

  if (format === 'html') {
    paragraphs.unshift(`<p><strong>VCSCI Score: ${avgScore.toFixed(2)}/5.0 (${summaryLabel})</strong></p>`);
    paragraphs.unshift(`<p><em>${summaryText}</em></p>`);
    return paragraphs.join('\n');
  } else {
    paragraphs.unshift(`\n**VCSCI Score: ${avgScore.toFixed(2)}/5.0 (${summaryLabel})**`);
    paragraphs.unshift(`*${summaryText}*\n`);
    return paragraphs.join('\n\n');
  }
}
