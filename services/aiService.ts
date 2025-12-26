
import { GoogleGenAI, Type } from "@google/genai";

/**
 * Analyzes an image to provide optimal slicing suggestions for long-form content.
 * @param base64Image The image data as a base64 encoded string (including prefix).
 */
export const analyzeImageSlicing = async (base64Image: string) => {
  // Always initialize with named parameters and process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    作为一名专业的UI/UX工程师，请分析这张图片，并给出最佳的长图切割建议：
    1. 建议的单张切片高度是多少（以像素为单位）？
    2. 为什么要这样切？
    3. 图片中的主要内容是什么？
  `;

  try {
    // Using gemini-3-pro-preview for complex reasoning and multimodal understanding
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        // Use responseSchema for predictable structured output as per guidelines
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedHeight: {
              type: Type.NUMBER,
              description: '建议的单张切片高度（像素）',
            },
            reason: {
              type: Type.STRING,
              description: '切分逻辑说明',
            },
            description: {
              type: Type.STRING,
              description: '图像内容分析',
            },
          },
          required: ['suggestedHeight', 'reason', 'description'],
        }
      }
    });

    // Access the .text property directly (not as a method call)
    const jsonStr = response.text;
    if (!jsonStr) {
      throw new Error('Empty response from AI');
    }

    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error('AI Analysis failed:', error);
    return null;
  }
};
