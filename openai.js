// openai.js (usando solo la API de OpenAI sin Baileys ni QR)

const { Configuration, OpenAIApi } = require("openai");
require("dotenv").config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

// Historial de conversaciones en memoria (puedes adaptar a base de datos si deseas)
const historial = {};

// Función principal para obtener respuestas
async function obtenerRespuestaIA(mensajes, numero) {
  if (!historial[numero]) {
    historial[numero] = [];
  }

  historial[numero] = [...historial[numero], ...mensajes].slice(-10); // Máximo 10 últimos intercambios

  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: historial[numero],
    temperature: 0.7,
  });

  const respuesta = response.data.choices[0].message.content;
  historial[numero].push({ role: 'assistant', content: respuesta });

  return respuesta;
}

module.exports = { obtenerRespuestaIA };
