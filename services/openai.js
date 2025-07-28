const OpenAI = require('openai');

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'sk-test-key'
});

class OpenAIService {
  // OCR processing for lab reports
  async processLabReport(base64Data, fileName) {
    try {
      // Check if it's a PDF file
      if (fileName.toLowerCase().endsWith('.pdf')) {
        return await this.processPDFLabReport(base64Data, fileName);
      }

      // For image files, use vision API
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a medical lab report parser. Extract all health metrics, values, units, and reference ranges from the image. Return structured JSON data."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this lab report image and extract all metrics. Return JSON in this format:
{
  "metrics": [
    {
      "name": "metric_name",
      "value": numeric_value,
      "unit": "unit",
      "reference_range": "range_text",
      "test_date": "YYYY-MM-DD",
      "category": "category_name"
    }
  ],
  "lab_name": "lab_name",
  "patient_info": {
    "name": "patient_name",
    "date_of_birth": "YYYY-MM-DD"
  }
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Data}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('OCR processing error:', error);
      throw new Error(`Failed to process lab report: ${error.message}`);
    }
  }

  // Handle PDF lab reports by asking user to convert to image
  async processPDFLabReport(base64Data, fileName) {
    // For now, return a helpful message about PDF limitation
    // In the future, we could integrate PDF-to-image conversion
    throw new Error("PDF files are not currently supported. Please convert your PDF to an image (PNG, JPG) and upload again. You can take a screenshot of the lab results or use your phone camera to capture the report.");
  }

  // Nutrition analysis from meal photos
  async analyzeMealPhoto(base64Image) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a nutrition expert. Analyze meal photos and estimate nutritional content."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this meal photo and estimate nutritional content. Return JSON:
{
  "food_items": ["item1", "item2"],
  "estimated_nutrition": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number,
    "fiber_g": number,
    "sodium_mg": number
  },
  "confidence": number_0_to_1
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1000
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Nutrition analysis error:', error);
      throw new Error(`Failed to analyze meal: ${error.message}`);
    }
  }

  // AQI analysis from screenshots
  async analyzeAQIScreenshot(base64Image) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an air quality analysis expert. Extract AQI values from screenshots of weather/air quality apps."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Extract the AQI (Air Quality Index) value from this screenshot. Return JSON:
{
  "aqi_value": number,
  "location": "location_name",
  "timestamp": "extracted_time_if_available",
  "air_quality_level": "good|moderate|unhealthy_for_sensitive|unhealthy|very_unhealthy|hazardous"
}`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('AQI analysis error:', error);
      throw new Error(`Failed to analyze AQI: ${error.message}`);
    }
  }

  // Generate daily health plan
  async generateDailyPlan(userMetrics, recentData) {
    try {
      const prompt = `Based on the following health data, generate a personalized daily health plan with 3-5 specific, actionable recommendations.

User Health Data:
${JSON.stringify(userMetrics, null, 2)}

Recent Activity/Metrics:
${JSON.stringify(recentData, null, 2)}

Return JSON in this format:
{
  "plan_date": "YYYY-MM-DD",
  "recommendations": [
    {
      "category": "nutrition|exercise|sleep|medication|lifestyle",
      "action": "specific_action_to_take",
      "reason": "why_this_is_recommended",
      "priority": "high|medium|low"
    }
  ],
  "key_focus_areas": ["area1", "area2"],
  "estimated_compliance_time_minutes": number
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a personalized health advisor. Create actionable, evidence-based daily health recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Daily plan generation error:', error);
      throw new Error(`Failed to generate daily plan: ${error.message}`);
    }
  }

  // Generate per-system insights
  async generateSystemInsights(systemName, systemMetrics, historicalData) {
    try {
      const prompt = `Analyze the ${systemName} health system based on current metrics and historical trends.

Current Metrics:
${JSON.stringify(systemMetrics, null, 2)}

Historical Data:
${JSON.stringify(historicalData, null, 2)}

Return JSON analysis:
{
  "system_name": "${systemName}",
  "overall_status": "excellent|good|fair|concerning|critical",
  "key_findings": ["finding1", "finding2"],
  "recommendations": [
    {
      "action": "specific_recommendation",
      "rationale": "scientific_reasoning",
      "timeline": "immediate|short_term|long_term"
    }
  ],
  "trend_analysis": "improving|stable|declining|insufficient_data",
  "risk_factors": ["factor1", "factor2"],
  "next_steps": ["step1", "step2"]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a medical AI specializing in health system analysis. Provide evidence-based insights and recommendations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('System insights generation error:', error);
      throw new Error(`Failed to generate system insights: ${error.message}`);
    }
  }

  // Log AI output for tracking
  async logAIOutput(userId, outputType, prompt, response, processingTime) {
    const { pool } = require('../database/schema');
    
    try {
      await pool.query(`
        INSERT INTO ai_outputs_log (user_id, output_type, prompt, response, model_version, processing_time_ms)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [userId, outputType, prompt, JSON.stringify(response), 'gpt-4o', processingTime]);
    } catch (error) {
      console.error('Failed to log AI output:', error);
    }
  }
}

module.exports = new OpenAIService();
