const { obtenerRespuestaIA } = require('./openai');
const {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');

const historialConversaciones = {};

async function iniciarBot() {
  console.log("📦 Verificando archivos de sesión...");

  const sessionPath = './auth_info_baileys';
  const credsFile = `${sessionPath}/creds.json`;

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const numero = msg.key.remoteJid;
    const mensajeUsuario = msg.message.conversation || msg.message.extendedTextMessage?.text || '';

    console.log(`💬 Mensaje de ${numero}: ${mensajeUsuario}`);

    if (!historialConversaciones[numero]) {
      historialConversaciones[numero] = [];
    }

    historialConversaciones[numero].push({ role: 'user', content: mensajeUsuario });

    try {
      const respuestaIA = await obtenerRespuestaIA(historialConversaciones[numero]);
      historialConversaciones[numero].push({ role: 'assistant', content: respuestaIA });

      await sock.sendMessage(numero, { text: respuestaIA });
    } catch (error) {
      console.error('❌ Error al procesar mensaje:', error);
      await sock.sendMessage(numero, { text: 'Lo siento, hubo un error procesando tu mensaje.' });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('🔌 Conexión cerrada. Reintentando:', shouldReconnect);

      if (shouldReconnect) {
        iniciarBot(); // Reintenta conexión
      } else {
        console.log('📴 Sesión cerrada completamente. Borra ./auth_info_baileys para reiniciar.');
      }
    }

    if (connection === 'open') {
      console.log('✅ Bot conectado exitosamente a WhatsApp');
    }
  });
}

iniciarBot();
