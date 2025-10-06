const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');
const catalog = require('../shared/metricsCatalog');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-test-key'
});

class MetricSuggestionService {
  constructor() {
    this.synonymsData = null;
    this.metricsData = null;
    this.loadReferenceData();
  }

  async loadReferenceData() {
    try {
      // Load unified catalog once
      catalog.loadCatalog();
      // For backward compatibility keep properties populated
      this.synonymsData = { synonyms: {}, units_synonyms: {} };
      this.metricsData = catalog.getAllMetrics();
      console.log('[METRIC_SUGGESTIONS] Unified catalog loaded successfully');
    } catch (error) {
      console.error('[METRIC_SUGGESTIONS] Failed to load unified catalog:', error);
      this.synonymsData = { synonyms: {}, units_synonyms: {} };
      this.metricsData = [];
    }
  }

  // Generate LLM suggestions for unmatched metrics (free-form, no reference lists)
  async generateSuggestions(unmatchedMetrics, context = {}) {
    try {
      // Build per-metric prompts and call LLM individually, then aggregate
      const buildPrompt = (m) => `You are a medical AI helping to standardize laboratory metric names.

TASK:
- For the given metric from a lab report, decide the most appropriate standardized metric name.
- Do NOT rely on any predefined catalog or list; use medical knowledge.
- If the name already appears standard, you may keep it.
- Ensure unit compatibility and typical clinical usage.

INPUT METRIC:
- Name: "${m.name}"
- Value: ${m.value} ${m.unit || ''}
- Category/Panel: ${m.category || 'unknown'}

CONTEXT (optional):
- Lab name: ${context.labName || 'Unknown'}
- Patient age/sex: ${context.patientAge || 'Unknown'}/${context.patientSex || 'Unknown'}
- Report date: ${context.testDate || 'Unknown'}

OUTPUT JSON FORMAT (strict):
{
  "original_name": "${m.name}",
  "suggested_matches": [
    {
      "standard_name": "Best standardized name or original if already standard",
      "confidence": 0.0,
      "reason": "Brief medical justification, unit/context rationale"
    }
  ],
  "needs_clarification": false,
  "clarification_note": "Optional note for manual review"
}
Return only valid JSON and nothing else.`;

      const calls = unmatchedMetrics.map(async (m) => {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: 'You are a medical laboratory data standardization expert. Always return valid JSON.' },
            { role: 'user', content: buildPrompt(m) }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 600,
          temperature: 0.1
        });

        // Each call returns a single-entry structure; normalize into the common envelope
        let item;
        try {
          item = JSON.parse(response.choices[0].message.content);
        } catch (_) {
          item = {
            original_name: m.name,
            suggested_matches: [],
            needs_clarification: true,
            clarification_note: 'Model returned unparsable content.'
          };
        }

        // Guarantee required fields
        if (!Array.isArray(item.suggested_matches)) item.suggested_matches = [];
        if (typeof item.needs_clarification !== 'boolean') item.needs_clarification = false;
        if (typeof item.original_name !== 'string') item.original_name = m.name;

        return item;
      });

      const perMetric = await Promise.all(calls);
      const suggestions = { suggestions: perMetric };

      console.log(`[METRIC_SUGGESTIONS] Generated suggestions (free-form) for ${unmatchedMetrics.length} metrics`);
      return suggestions;

    } catch (error) {
      console.error('[METRIC_SUGGESTIONS] Error generating suggestions:', error);
      throw new Error(`Failed to generate metric suggestions: ${error.message}`);
    }
  }

  // Find exact matches using synonym lookup
  findExactMatches(inputMetrics) {
    const matched = [];
    const unmatched = [];

    for (const metric of inputMetrics) {
      const normalizedName = this.normalizeMetricName(metric.name);
      
      if (normalizedName !== metric.name) {
        // Found a synonym match
        matched.push({
          ...metric,
          original_name: metric.name,
          standard_name: normalizedName,
          match_type: 'synonym'
        });
      } else {
        // Check if it exists in unified catalog
        const exactMatch = catalog.findMetricByName(metric.name);
        
        if (exactMatch) {
          matched.push({
            ...metric,
            original_name: metric.name,
            standard_name: exactMatch.metric,
            match_type: 'exact'
          });
        } else {
          unmatched.push(metric);
        }
      }
    }

    return { matched, unmatched };
  }

  // Normalize metric name using synonyms lookup
  normalizeMetricName(inputName) {
    if (!inputName) return inputName;
    return catalog.normalizeName(inputName);
  }

  // Process metrics through the complete pipeline
  async processMetrics(inputMetrics, context = {}) {
    // Step 1: Find exact matches using synonyms
    const { matched, unmatched } = this.findExactMatches(inputMetrics);

    console.log(`[METRIC_SUGGESTIONS] Exact matches: ${matched.length}, Unmatched: ${unmatched.length}`);

    // Step 2: Generate LLM suggestions for unmatched metrics
    let suggestions = null;
    if (unmatched.length > 0) {
      suggestions = await this.generateSuggestions(unmatched, context);
    }

    return {
      exact_matches: matched,
      unmatched_metrics: unmatched,
      ai_suggestions: suggestions,
      summary: {
        total_metrics: inputMetrics.length,
        exact_matches: matched.length,
        needs_review: unmatched.length
      }
    };
  }
}

module.exports = new MetricSuggestionService();
