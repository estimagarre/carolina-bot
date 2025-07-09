# 🤖 Carolina Bot – Depósito de Materiales Reformante

Este bot inteligente responde automáticamente desde WhatsApp a consultas sobre productos de construcción, usando inteligencia artificial (OpenAI) y Baileys.

---

## 📦 Funciones principales:

✅ Responde preguntas sobre materiales (cemento, gravilla, tejas, herramientas, etc.)  
✅ Informa precios y disponibilidad con base en el archivo `memoria.json`  
✅ Explica formas de pago y entregas en Medellín  
✅ Atiende pedidos para entregas locales  
✅ Redirecciona al asesor humano si se requiere cotización especial  
✅ Muestra combos y productos destacados  
✅ Envia imágenes o catálogos si se configura en la lógica

---

## 🛠 Archivos importantes:

- `index.js` → Controlador principal del bot
- `openai.js` → Comunicación con OpenAI y lógica de IA
- `memoria.json` → Catálogo con todos los productos y precios
- `server.js` → Servidor HTTP para mantener activo en Render
- `.env` → Variables secretas como `OPENAI_API_KEY`, etc.

---

## 🚀 Instalación

1. Clona el repositorio en tu máquina local:
```bash
git clone https://github.com/tuusuario/carina-bot-reformante.git
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea el archivo `.env` con tus claves:
```
OPENAI_API_KEY=sk-...
PORT=3050
```

4. Ejecuta el bot:
```bash
node index.js
```

5. Escanea el QR desde tu WhatsApp para activar sesión.

---

## 🧠 Entrenamiento

El bot ha sido entrenado con base en los productos del archivo `memoria.json`, que se derivan de un Excel maestro. Este catálogo es usado para responder preguntas con IA tipo ChatGPT.

---

## 🌐 Deploy en Render

- Sube tu proyecto a GitHub.
- En Render, crea un nuevo servicio web con ese repositorio.
- Asegúrate de que el puerto (`PORT`) coincida con tu archivo `.env`.

---

## 📞 Contacto

Este bot fue desarrollado para **Reformante – Depósito de materiales en Medellín**. Para soporte técnico o mejoras, contactar al desarrollador original o actualizar vía GitHub.

