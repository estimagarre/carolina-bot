// openai.js (versión para OpenAI 4.x)
const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const historial = {};

async function obtenerRespuestaIA(mensajes, numero) {
  if (!historial[numero]) {
    historial[numero] = [];
  }

  historial[numero] = [...historial[numero], ...mensajes].slice(-10);

  const respuesta = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: historial[numero],
    temperature: 0.7,
  });

  const mensajeIA = respuesta.choices[0].message.content;
  historial[numero].push({ role: "assistant", content: mensajeIA });

  return mensajeIA;
}

module.exports = { obtenerRespuestaIA };
