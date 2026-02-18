#!/usr/bin/env node

/**
 * Generate Evaluation Report
 *
 * Creates a comprehensive markdown report documenting the complete
 * chain of thought for evaluated pictograms.
 *
 * Usage:
 *   node scripts/generate-report.js [options]
 *
 * Options:
 *   --output <file>        Output file (default: analysis/reports/YYYY-MM-DD-evaluation.md)
 *   --title <title>        Report title
 *   --pipeline <version>   Filter by pipeline version
 *   --style <profile>      Filter by style profile
 *   --min-score <score>    Minimum VCSCI score to include
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const today = new Date().toISOString().split('T')[0];
const outputFile = getArg('--output') || `analysis/reports/${today}-evaluation.md`;
const reportTitle = getArg('--title') || `VCSCI Evaluation Report - ${today}`;
const filterPipeline = getArg('--pipeline');
const filterStyle = getArg('--style');
const minScore = parseFloat(getArg('--min-score')) || 0;
const includeDescriptions = args.includes('--include-descriptions');

console.log('VCSCI Report Generator');
console.log('=====================\n');

// Load rubric descriptions if needed
let rubricData = null;
if (includeDescriptions) {
  const rubricPath = path.join(__dirname, '../data/rubric-scale-descriptions.json');
  if (fs.existsSync(rubricPath)) {
    rubricData = JSON.parse(fs.readFileSync(rubricPath, 'utf8'));
    console.log('Loaded rubric descriptions for detailed reporting');
  } else {
    console.warn('Warning: rubric-scale-descriptions.json not found. Descriptions will be omitted.');
  }
}

// Load case scores
const scoresFile = 'analysis/results/case-scores.json';
if (!fs.existsSync(scoresFile)) {
  console.error('Error: No case scores found. Run "node scripts/score-cases.js" first.');
  process.exit(1);
}

const caseScores = JSON.parse(fs.readFileSync(scoresFile, 'utf8'));

// Filter cases
let cases = Object.values(caseScores);

if (filterPipeline) {
  cases = cases.filter(c => c.case_id.includes(filterPipeline));
  console.log(`Filtered by pipeline: ${filterPipeline}`);
}

if (filterStyle) {
  cases = cases.filter(c => c.case_id.includes(filterStyle));
  console.log(`Filtered by style: ${filterStyle}`);
}

if (minScore > 0) {
  cases = cases.filter(c => c.vcsci_score >= minScore);
  console.log(`Filtered by min score: ${minScore}`);
}

console.log(`Generating report for ${cases.length} cases...\n`);

// Generate report
const report = generateReport(cases);

// Write to file
const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputFile, report, 'utf8');
console.log(`Report saved to: ${outputFile}`);

// Helper functions

function getArg(flag) {
  const index = args.indexOf(flag);
  return index >= 0 && index < args.length - 1 ? args[index + 1] : null;
}

function generateReport(cases) {
  const lines = [];

  // Header
  lines.push(`# ${reportTitle}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Executive Summary
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(generateSummary(cases));
  lines.push('');

  // Overall Statistics
  lines.push('## Overall Statistics');
  lines.push('');
  lines.push(generateStatistics(cases));
  lines.push('');

  // Decision Distribution
  lines.push('## Decision Distribution');
  lines.push('');
  lines.push(generateDecisionChart(cases));
  lines.push('');

  // Top Performers
  lines.push('## Top Performing Pictograms');
  lines.push('');
  lines.push(generateTopCases(cases, true));
  lines.push('');

  // Needs Improvement
  lines.push('## Pictograms Needing Improvement');
  lines.push('');
  lines.push(generateTopCases(cases, false));
  lines.push('');

  // Common Required Edits
  lines.push('## Most Common Required Edits');
  lines.push('');
  lines.push(generateRequiredEdits(cases));
  lines.push('');

  // Dimension Analysis
  lines.push('## Dimension Analysis');
  lines.push('');
  lines.push(generateDimensionAnalysis(cases));
  lines.push('');

  // Case-by-Case Details
  lines.push('## Case-by-Case Details');
  lines.push('');
  lines.push(generateCaseDetails(cases));
  lines.push('');

  // Chain of Thought Examples
  lines.push('## Chain of Thought Examples');
  lines.push('');
  lines.push(generateChainExamples(cases));
  lines.push('');

  // Recommendations
  lines.push('## Recommendations');
  lines.push('');
  lines.push(generateRecommendations(cases));
  lines.push('');

  return lines.join('\n');
}

function generateSummary(cases) {
  const totalCases = cases.length;
  const avgScore = cases.reduce((sum, c) => sum + c.vcsci_score, 0) / totalCases;
  const acceptCount = cases.filter(c => c.decision === 'accept').length;
  const acceptRate = (acceptCount / totalCases * 100).toFixed(1);

  return `Evaluated **${totalCases}** pictograms with an average VCSCI score of **${avgScore.toFixed(2)}/5.0**.

**${acceptCount}** (${acceptRate}%) pictograms were accepted for production use.

The chain of thought was documented for all cases, providing complete traceability from input phrase to final evaluation.`;
}

function generateStatistics(cases) {
  const scores = cases.map(c => c.vcsci_score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = scores.sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const min = Math.min(...scores);
  const max = Math.max(...scores);

  return `| Metric | Value |
|--------|-------|
| **Total Cases** | ${cases.length} |
| **Mean VCSCI Score** | ${mean.toFixed(2)} |
| **Median VCSCI Score** | ${median.toFixed(2)} |
| **Min Score** | ${min.toFixed(2)} |
| **Max Score** | ${max.toFixed(2)} |
| **Unique Evaluators** | ${countUniqueEvaluators(cases)} |`;
}

function generateDecisionChart(cases) {
  const decisions = {};
  cases.forEach(c => {
    decisions[c.decision] = (decisions[c.decision] || 0) + 1;
  });

  let chart = '| Decision | Count | Percentage |\n';
  chart += '|----------|-------|------------|\n';

  Object.entries(decisions)
    .sort((a, b) => b[1] - a[1])
    .forEach(([decision, count]) => {
      const pct = (count / cases.length * 100).toFixed(1);
      const emoji = decision === 'accept' ? '✓' : decision === 'reject' ? '✗' : '✎';
      chart += `| ${emoji} ${decision} | ${count} | ${pct}% |\n`;
    });

  return chart;
}

function generateTopCases(cases, topPerformers = true) {
  const sorted = [...cases].sort((a, b) =>
    topPerformers ? b.vcsci_score - a.vcsci_score : a.vcsci_score - b.vcsci_score
  );

  const selected = sorted.slice(0, 5);

  let table = '| Case ID | VCSCI Score | Decision | Notes |\n';
  table += '|---------|-------------|----------|-------|\n';

  selected.forEach(c => {
    const emoji = c.decision === 'accept' ? '✓' : c.decision === 'reject' ? '✗' : '✎';
    table += `| \`${c.case_id}\` | ${c.vcsci_score.toFixed(2)} | ${emoji} ${c.decision} | |\n`;
  });

  return table;
}

function generateRequiredEdits(cases) {
  const editCounts = {};

  cases.forEach(c => {
    if (c.required_edits && c.required_edits.length > 0) {
      c.required_edits.forEach(edit => {
        const key = `${edit.category}: ${edit.description}`;
        editCounts[key] = (editCounts[key] || 0) + edit.count;
      });
    }
  });

  const sorted = Object.entries(editCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (sorted.length === 0) {
    return '_No required edits reported._';
  }

  let table = '| Edit | Frequency |\n';
  table += '|------|----------|\n';

  sorted.forEach(([edit, count]) => {
    table += `| ${edit} | ${count} |\n`;
  });

  return table;
}

function generateDimensionAnalysis(cases) {
  const dimensions = ['clarity', 'recognizability', 'semantic_transparency',
                      'pragmatic_fit', 'cultural_adequacy', 'cognitive_accessibility'];

  let table = '| Dimension | Mean | Median | Min | Max |\n';
  table += '|-----------|------|--------|-----|-----|\n';

  dimensions.forEach(dim => {
    const values = cases
      .map(c => c.ratings?.[dim]?.mean)
      .filter(v => v !== undefined);

    if (values.length > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sorted = values.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const min = Math.min(...values);
      const max = Math.max(...values);

      table += `| ${dim} | ${mean.toFixed(2)} | ${median.toFixed(2)} | ${min.toFixed(2)} | ${max.toFixed(2)} |\n`;
    }
  });

  return table;
}

function generateCaseDetails(cases) {
  let details = '';

  cases.slice(0, 10).forEach(c => {
    details += `### ${c.case_id}\n\n`;
    details += `- **VCSCI Score**: ${c.vcsci_score.toFixed(2)}/5.0\n`;
    details += `- **Decision**: ${c.decision}\n`;
    details += `- **Evaluators**: ${c.num_evaluators}\n`;
    details += `- **Roles**: ${c.evaluator_roles.join(', ')}\n`;

    if (c.required_edits && c.required_edits.length > 0) {
      details += '\n**Required Edits**:\n\n';
      c.required_edits.slice(0, 3).forEach(edit => {
        details += `- [${edit.priority}] ${edit.category}: ${edit.description}\n`;
      });
    }

    details += '\n';
  });

  return details;
}

function generateChainExamples(cases) {
  const accepted = cases.find(c => c.decision === 'accept');

  if (!accepted) {
    return '_No accepted cases to show._';
  }

  return `Example chain of thought for case \`${accepted.case_id}\`:

\`\`\`
1. Input → Phrase + Style Profile
2. Generation → Model produces SVG
3. Evaluation → VCSCI Score: ${accepted.vcsci_score.toFixed(2)}
4. Decision → ${accepted.decision}
5. Storage → SVG with embedded metadata (SSOT)
\`\`\`

This complete provenance ensures traceability and reproducibility.`;
}

function generateRecommendations(cases) {
  const avgScore = cases.reduce((sum, c) => sum + c.vcsci_score, 0) / cases.length;
  const acceptRate = cases.filter(c => c.decision === 'accept').length / cases.length;

  let recs = [];

  if (avgScore < 3.5) {
    recs.push('- **Overall scores are below acceptable threshold (3.5)**. Review generation parameters and style profiles.');
  }

  if (acceptRate < 0.6) {
    recs.push('- **Acceptance rate is low (<60%)**. Consider adjusting model configuration or style guidelines.');
  }

  // Check weakest dimension
  const dimensions = ['clarity', 'recognizability', 'semantic_transparency',
                      'pragmatic_fit', 'cultural_adequacy', 'cognitive_accessibility'];

  const dimScores = {};
  dimensions.forEach(dim => {
    const values = cases
      .map(c => c.ratings?.[dim]?.mean)
      .filter(v => v !== undefined);
    if (values.length > 0) {
      dimScores[dim] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  });

  const weakest = Object.entries(dimScores).sort((a, b) => a[1] - b[1])[0];
  if (weakest && weakest[1] < 3.5) {
    recs.push(`- **${weakest[0]}** is the weakest dimension (${weakest[1].toFixed(2)}). Focus improvement efforts here.`);
  }

  if (recs.length === 0) {
    recs.push('- **Overall performance is strong**. Continue with current approach.');
    recs.push('- Consider expanding the evaluated phrase set for more comprehensive assessment.');
  }

  return recs.join('\n');
}

function countUniqueEvaluators(cases) {
  const roles = new Set();
  cases.forEach(c => {
    c.evaluator_roles.forEach(role => roles.add(role));
  });
  return roles.size;
}
