import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ReceiptData {
  merchant: string;
  amount: number;
  date: string;
  category: string;
}

export async function parseReceipt(base64Image: string, mimeType: string): Promise<ReceiptData> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        "Analiza este ticket de compra. Extrae la siguiente información en formato JSON: el nombre del comercio (merchant), el importe total como número (amount), la fecha en formato YYYY-MM-DD (date), y una categoría sugerida (category) que debe ser una de las siguientes: Alimentación, Restaurantes, Transporte, Ocio, Suministros, Compras, Salud, Educación, Hogar, Mascotas, Viajes, Seguros, Tecnología, Otros.",
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING, description: "Nombre del comercio" },
            amount: { type: Type.NUMBER, description: "Importe total del ticket" },
            date: { type: Type.STRING, description: "Fecha de la compra en formato YYYY-MM-DD" },
            category: { type: Type.STRING, description: "Categoría sugerida (Alimentación, Restaurantes, Transporte, Ocio, Suministros, Compras, Salud, Educación, Hogar, Mascotas, Viajes, Seguros, Tecnología, Otros)" },
          },
          required: ["merchant", "amount", "date", "category"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");
    
    return JSON.parse(text) as ReceiptData;
  } catch (error) {
    console.error("Error parsing receipt:", error);
    throw error;
  }
}
