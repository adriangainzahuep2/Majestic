const openai = require('openai');

const openaiClient = new openai({
  apiKey: process.env.OPENAI_API_KEY
});

class VisualStudyService {
  async extractStudyData(base64Data, fileName, expectedStudyType) {
    try {
      console.log(`[VISUAL_EXTRACTION] Processing ${fileName} as ${expectedStudyType}`);

      const extractionPrompt = `
        You are a medical AI analyzing a visual study/imaging report.
        
        Study Type Expected: ${expectedStudyType}
        Filename: ${fileName}
        
        Extract the following information and return ONLY valid JSON:
        
        {
          "studyType": "exact_study_type_found",
          "measurements": [
            {"name": "metric_name", "value": numeric_value, "units": "unit_string"}
          ],
          "keyFindings": [
            "finding_1",
            "finding_2"
          ],
          "dateFoundInImage": "YYYY-MM-DD",
          "summary": "Brief clinical summary of the study results"
        }
        
        Important guidelines:
        - Extract ALL numeric measurements with their exact values and units
        - Include key clinical findings as text
        - Look for dates in the image (test date, study date)
        - Provide a concise clinical summary
        - If no measurements found, return empty array for measurements
        - Be precise with study type identification
      `;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log(`[VISUAL_EXTRACTION] Extracted ${result.measurements?.length || 0} measurements`);
      
      return result;

    } catch (error) {
      console.error('[VISUAL_EXTRACTION] Failed:', error);
      throw new Error(`Visual study extraction failed: ${error.message}`);
    }
  }

  async generateComparison(currentStudy, previousStudy, allPreviousStudies) {
    try {
      console.log(`[COMPARISON] Comparing studies for ${currentStudy.study_type}`);

      const comparisonPrompt = `
        Compare these medical imaging studies of the same type.
        
        Current Study (${currentStudy.test_date}):
        - Metrics: ${JSON.stringify(currentStudy.metrics_json)}
        - Summary: ${currentStudy.ai_summary}
        
        Previous Study (${previousStudy.test_date}):
        - Metrics: ${JSON.stringify(previousStudy.metrics_json)}
        - Summary: ${previousStudy.ai_summary}
        
        Generate a comparison and return ONLY valid JSON:
        
        {
          "trendSummary": "Overall trend description comparing current to previous studies",
          "metricChanges": [
            {
              "metric": "metric_name",
              "previous": {"value": number, "units": "string", "date": "YYYY-MM-DD"},
              "current": {"value": number, "units": "string", "date": "YYYY-MM-DD"},
              "trend": "improved|stable|worsened|new_finding"
            }
          ]
        }
        
        Guidelines:
        - Focus on clinically significant changes
        - Use medical terminology appropriately
        - Include trend direction (improved/stable/worsened)
        - Compare metrics with same names between studies
        - Provide meaningful clinical interpretation
      `;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: comparisonPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log(`[COMPARISON] Generated comparison with ${result.metricChanges?.length || 0} metric changes`);
      
      return result;

    } catch (error) {
      console.error('[COMPARISON] Failed:', error);
      return {
        trendSummary: 'Comparison analysis unavailable',
        metricChanges: []
      };
    }
  }

  async getStudyTypeMapping() {
    return {
      'eye_topography': {
        systemId: 12,
        systemName: 'Sensory',
        commonMetrics: ['Kmax', 'cornealThickness', 'astigmatism']
      },
      'oct': {
        systemId: 12,
        systemName: 'Sensory', 
        commonMetrics: ['retinalThickness', 'maculaVolume', 'RNFL']
      },
      'fundus': {
        systemId: 12,
        systemName: 'Sensory',
        commonMetrics: ['cupDiscRatio', 'maculaGrade', 'vesselCalibration']
      },
      'mri': {
        systemId: 2,
        systemName: 'Nervous/Brain',
        commonMetrics: ['lesionCount', 'ventricleSize', 'atrophy']
      },
      'ct': {
        systemId: 2,
        systemName: 'Nervous/Brain',
        commonMetrics: ['hounsfield', 'density', 'volume']
      },
      'xray': {
        systemId: 5,
        systemName: 'Skeletal',
        commonMetrics: ['boneDensity', 'fractures', 'alignment']
      },
      'dexa': {
        systemId: 5,
        systemName: 'Skeletal',
        commonMetrics: ['boneDensity', 'tScore', 'zScore']
      },
      'ecg': {
        systemId: 1,
        systemName: 'Cardiovascular',
        commonMetrics: ['heartRate', 'qtInterval', 'rhythm']
      },
      'eeg': {
        systemId: 2,
        systemName: 'Nervous/Brain',
        commonMetrics: ['frequency', 'amplitude', 'waveform']
      }
    };
  }
}

module.exports = new VisualStudyService();