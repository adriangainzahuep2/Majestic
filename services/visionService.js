const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Vision Service
 * Handles image analysis and extraction of lab results from visual documents
 */

/**
 * Extract metrics from image using GPT-4 Vision
 */
async function extractMetricsFromImage(base64Image) {
  try {
    console.log('[Vision] Analyzing image for lab results...');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a medical document analyzer. Extract all laboratory test results from images of lab reports, medical documents, or health records.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this lab report image and extract all test results.

For each metric, provide:
- name: The test/metric name
- value: The numeric value
- unit: Unit of measurement
- referenceRange: Normal range if shown

Also extract the test date if visible.

Respond ONLY with valid JSON:
{
  "testDate": "YYYY-MM-DD",
  "metrics": [
    {
      "name": "string",
      "value": "number or string",
      "unit": "string",
      "referenceRange": "string"
    }
  ]
}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonText = content;
    if (content.includes('```json')) {
      jsonText = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
    }

    const extracted = JSON.parse(jsonText);

    console.log(`[Vision] Extracted ${extracted.metrics?.length || 0} metrics from image`);

    return {
      testDate: extracted.testDate || new Date().toISOString().split('T')[0],
      metrics: extracted.metrics || []
    };

  } catch (error) {
    console.error('[Vision] Image analysis error:', error);
    
    if (error.message.includes('Invalid image')) {
      throw new Error('Invalid or corrupted image file');
    }
    
    if (error.message.includes('rate limit')) {
      throw new Error('API rate limit exceeded. Please try again later.');
    }

    throw new Error(`Failed to analyze image: ${error.message}`);
  }
}

/**
 * Analyze imaging study (X-ray, MRI, CT, etc.)
 */
async function analyzeImagingStudy(base64Image, studyType = 'unknown') {
  try {
    console.log(`[Vision] Analyzing ${studyType} imaging study...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a medical imaging analyst. Provide objective observations from medical imaging studies.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this ${studyType} medical imaging study.

Provide:
1. Visual observations (what can be seen)
2. Any notable features or findings
3. Areas of potential concern (if any)
4. Quality of the image

IMPORTANT: Do not provide medical diagnoses. Only describe what is visible in the image.

Respond with JSON:
{
  "studyType": "string",
  "observations": ["string"],
  "notableFeatures": ["string"],
  "imageQuality": "good/fair/poor",
  "summary": "string"
}`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const content = response.choices[0].message.content;
    
    let jsonText = content;
    if (content.includes('```json')) {
      jsonText = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonText);

    console.log('[Vision] Imaging study analysis complete');

    return analysis;

  } catch (error) {
    console.error('[Vision] Imaging study analysis error:', error);
    throw new Error(`Failed to analyze imaging study: ${error.message}`);
  }
}

/**
 * Compare two imaging studies
 */
async function compareImagingStudies(base64Image1, base64Image2, studyType) {
  try {
    console.log(`[Vision] Comparing two ${studyType} studies...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a medical imaging analyst comparing sequential medical images to identify changes over time.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Compare these two ${studyType} images taken at different times.

Identify:
1. Changes between the images
2. Improvements or progressions
3. Stable features
4. Any new findings

Respond with JSON:
{
  "changes": ["string"],
  "improvements": ["string"],
  "progressions": ["string"],
  "stableFeatures": ["string"],
  "summary": "string"
}`
            },
            {
              type: 'text',
              text: 'Image 1 (Earlier):'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image1}`
              }
            },
            {
              type: 'text',
              text: 'Image 2 (Later):'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image2}`
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.3
    });

    const content = response.choices[0].message.content;
    
    let jsonText = content;
    if (content.includes('```json')) {
      jsonText = content.split('```json')[1].split('```')[0].trim();
    } else if (content.includes('```')) {
      jsonText = content.split('```')[1].split('```')[0].trim();
    }

    const comparison = JSON.parse(jsonText);

    console.log('[Vision] Imaging comparison complete');

    return comparison;

  } catch (error) {
    console.error('[Vision] Imaging comparison error:', error);
    throw new Error(`Failed to compare imaging studies: ${error.message}`);
  }
}

/**
 * Validate image quality
 */
async function validateImageQuality(base64Image) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Assess the quality and readability of this medical document image. Is the text clear and readable? Respond with JSON: { "quality": "good/fair/poor", "readable": true/false, "issues": ["string"] }'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 200,
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    const quality = JSON.parse(content);

    return quality;

  } catch (error) {
    console.error('[Vision] Quality validation error:', error);
    return {
      quality: 'unknown',
      readable: true,
      issues: []
    };
  }
}

module.exports = {
  extractMetricsFromImage,
  analyzeImagingStudy,
  compareImagingStudies,
  validateImageQuality
};
