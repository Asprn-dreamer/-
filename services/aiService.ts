
import { GoogleGenAI } from "@google/genai";

export const analyzeImageSlicing = async (base64Image: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    作为一名专业的UI/UX工程师，请分析这张图片，并给出最佳的长图切割建议：
    1. 建议的单张切片高度是多少（以像素为单位）？
    2. 为什么要这样切？
    3. 图片中的主要内容是什么？
    
    请以 JSON 格式返回，包含字段：suggestedHeight (number), reason (string), description (string)。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: 'application/json'
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error('AI Analysis failed:', error);
    return null;
  }
};
