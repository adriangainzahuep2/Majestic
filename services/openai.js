const OpenAI = require('openai');

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || 'sk-test-key'
});

class OpenAIService {
  // OCR processing for lab reports - supports both images and PDFs
  async processLabReport(base64Data, fileName) {
    try {
      const fileExtension = fileName.toLowerCase().split('.').pop();
      let contentData;

      // Handle PDF vs Image files using correct API format
      if (fileExtension === 'pdf') {
        // Use Files API for PDFs - need to upload first
        return await this.processPDFWithFilesAPI(base64Data, fileName);
      } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension)) {
        // Use image_url type for images
        const mimeType = fileExtension === 'jpg' ? 'jpeg' : fileExtension;
        contentData = {
          type: "image_url",
          image_url: {
            url: `data:image/${mimeType};base64,${base64Data}`
          }
        };
      } else {
        throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: PDF, PNG, JPG, JPEG, GIF, WEBP`);
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a medical lab report parser. Extract all health metrics, values, units, and reference ranges from the document or image. Return structured JSON data. Be thorough in extracting all numerical values and their associated test names."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this lab report (${fileExtension.toUpperCase()} file) and extract all metrics. Return JSON in this exact format:
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
}

Extract every numerical health metric you can find. For test_date, use the collection date or report date if available. For category, classify each metric into one of these health areas: cardiovascular, brain, respiratory, muscle, bone, digestive, hormone, kidney, reproductive, skin, immune, sensory, or aging.`
              },
              contentData
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.1
      });

      const result = JSON.parse(response.choices[0].message.content);
      console.log(`Successfully processed ${fileExtension.toUpperCase()} lab report: ${fileName}`);
      console.log(`Extracted ${result.metrics?.length || 0} metrics`);
      
      return result;
    } catch (error) {
      console.error('Lab report processing error:', error);
      throw new Error(`Failed to process lab report: ${error.message}`);
    }
  }

  // Process PDF using Files API approach
  async processPDFWithFilesAPI(base64Data, fileName) {
    try {
      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(base64Data, 'base64');
      
      // Create a temporary file for upload
      const fs = require('fs').promises;
      const path = require('path');
      const tempPath = path.join('uploads', `temp_${Date.now()}_${fileName}`);
      
      await fs.writeFile(tempPath, pdfBuffer);
      
      // Upload file to OpenAI
      const file = await openai.files.create({
        file: require('fs').createReadStream(tempPath),
        purpose: 'assistants'
      });

      // Use the file in chat completion with file type
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a medical lab report parser. Extract all health metrics, values, units, and reference ranges from the PDF document. Return structured JSON data. Be thorough in extracting all numerical values and their associated test names."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Parse this lab report PDF and extract all metrics. Return JSON in this exact format:
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
}

Extract every numerical health metric you can find. For test_date, use the collection date or report date if available. For category, classify each metric into one of these health areas: cardiovascular, brain, respiratory, muscle, bone, digestive, hormone, kidney, reproductive, skin, immune, sensory, or aging.`
              },
              {
                type: "file",
                file: { file_id: file.id }
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 4000,
        temperature: 0.1
      });

      // Clean up temp file
      await fs.unlink(tempPath).catch(console.error);
      
      // Clean up uploaded file (use correct method)
      try {
        await openai.files.delete(file.id);
      } catch (deleteError) {
        console.warn('Could not delete uploaded file:', deleteError.message);
      }

      const result = JSON.parse(response.choices[0].message.content);
      console.log(`Successfully processed PDF lab report: ${fileName}`);
      console.log(`Extracted ${result.metrics?.length || 0} metrics`);
      
      return result;
    } catch (error) {
      console.error('PDF processing error:', error);
      throw new Error(`Failed to process PDF lab report: ${error.message}`);
    }
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
