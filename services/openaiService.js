const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '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'
});

/**
 * OpenAI Service
 * Handles AI text generation and analysis
 */

/**
 * Generate completion using GPT-4
 */
async function generateCompletion(prompt, options = {}) {
  try {
    const {
      model = 'gpt-4o',
      temperature = 0.7,
      maxTokens = 2000,
      responseFormat = 'text'
    } = options;

    console.log('[OpenAI] Generating completion...');

    const messages = [
      {
        role: 'system',
        content: 'You are a medical AI assistant helping analyze health data and provide insights. Always provide accurate, evidence-based information.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: temperature,
      max_tokens: maxTokens,
      response_format: responseFormat === 'json' ? { type: 'json_object' } : undefined
    });

    const response = completion.choices[0].message.content;
    
    console.log(`[OpenAI] Completion generated (${response.length} chars)`);

    return response;

  } catch (error) {
    console.error('[OpenAI] Generation error:', error);
    
    if (error.code === 'insufficient_quota') {
      throw new Error('OpenAI API quota exceeded. Please check your billing.');
    }
    
    if (error.code === 'invalid_api_key') {
      throw new Error('Invalid OpenAI API key. Please check configuration.');
    }

    throw new Error(`AI generation failed: ${error.message}`);
  }
}

/**
 * Generate structured JSON response
 */
async function generateStructuredResponse(prompt, schema) {
  try {
    const enhancedPrompt = `${prompt}\n\nRespond ONLY with valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}`;

    const response = await generateCompletion(enhancedPrompt, {
      responseFormat: 'json',
      temperature: 0.3 // Lower temperature for more structured output
    });

    return JSON.parse(response);

  } catch (error) {
    console.error('[OpenAI] Structured response error:', error);
    throw error;
  }
}

/**
 * Analyze lab results text
 */
async function analyzeLabResults(text) {
  try {
    const prompt = `Extract all laboratory test results from the following text.
    
    For each metric found, extract:
    - name: The metric name
    - value: The numeric value
    - unit: The unit of measurement
    - referenceRange: The normal/reference range if provided
    - date: The test date if provided
    
    Text to analyze:
    ${text}
    
    Respond with JSON: { testDate: "YYYY-MM-DD", metrics: [{name, value, unit, referenceRange}] }`;

    const response = await generateStructuredResponse(prompt, {
      testDate: 'string',
      metrics: [
        {
          name: 'string',
          value: 'number',
          unit: 'string',
          referenceRange: 'string'
        }
      ]
    });

    return response;

  } catch (error) {
    console.error('[OpenAI] Lab results analysis error:', error);
    throw error;
  }
}

/**
 * Generate health insights
 */
async function generateHealthInsights(metrics, userProfile = {}) {
  try {
    const prompt = `Analyze these health metrics and provide personalized insights:
    
    User Profile:
    ${JSON.stringify(userProfile, null, 2)}
    
    Metrics:
    ${JSON.stringify(metrics, null, 2)}
    
    Provide:
    1. Key findings (top 3-5 most important observations)
    2. Positive indicators (what's going well)
    3. Areas of concern (what needs attention)
    4. Actionable recommendations
    
    Respond with JSON: { keyFindings: [], positives: [], concerns: [], recommendations: [] }`;

    const insights = await generateStructuredResponse(prompt, {
      keyFindings: ['string'],
      positives: ['string'],
      concerns: ['string'],
      recommendations: ['string']
    });

    return insights;

  } catch (error) {
    console.error('[OpenAI] Health insights error:', error);
    throw error;
  }
}

/**
 * Match metric name to catalog
 */
async function matchMetricName(unmatchedName, catalogMetrics) {
  try {
    const prompt = `Given the lab test metric name "${unmatchedName}", find the best match from this catalog:
    
    ${catalogMetrics.slice(0, 100).map(m => `- ${m.metric_name} (${m.metric_id})`).join('\n')}
    
    Respond with the top 3 most likely matches with confidence scores (0-1).
    
    JSON format: { matches: [{ metricId, metricName, confidence, reason }] }`;

    const response = await generateStructuredResponse(prompt, {
      matches: [
        {
          metricId: 'string',
          metricName: 'string',
          confidence: 'number',
          reason: 'string'
        }
      ]
    });

    return response.matches;

  } catch (error) {
    console.error('[OpenAI] Metric matching error:', error);
    throw error;
  }
}

/**
 * Generate daily action plan
 */
async function generateDailyPlan(userProfile, metrics, insights) {
  try {
    const prompt = `Create a personalized daily action plan for:
    
    User: ${userProfile.sex}, ${userProfile.age || 'unknown'} years old
    
    Recent Metrics:
    ${JSON.stringify(metrics, null, 2)}
    
    Key Insights:
    ${JSON.stringify(insights, null, 2)}
    
    Create a practical daily plan with:
    - Morning routine (diet, supplements, activities)
    - Daytime activities (exercise, habits, monitoring)
    - Evening routine (sleep, recovery, tracking)
    - Top 3 priority actions
    
    Respond with JSON: { morning: [], day: [], evening: [], priorities: [] }`;

    const plan = await generateStructuredResponse(prompt, {
      morning: ['string'],
      day: ['string'],
      evening: ['string'],
      priorities: ['string']
    });

    return plan;

  } catch (error) {
    console.error('[OpenAI] Daily plan error:', error);
    throw error;
  }
}

/**
 * Test API connection
 */
async function testConnection() {
  try {
    const response = await generateCompletion('Say "OK" if you can read this.', {
      maxTokens: 10
    });
    
    return response.toLowerCase().includes('ok');

  } catch (error) {
    console.error('[OpenAI] Connection test failed:', error);
    return false;
  }
}

module.exports = {
  generateCompletion,
  generateStructuredResponse,
  analyzeLabResults,
  generateHealthInsights,
  matchMetricName,
  generateDailyPlan,
  testConnection
};
