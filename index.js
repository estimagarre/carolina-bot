const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const qrcode = require("qrcode-terminal");
const { obtenerRespuestaIA } = require("./openai");

const productos = JSON.parse(fs.readFileSync("productos_reformante.json", "utf8"));
const historialClientes = {};
const pedidosAcumulados = {};
const yaCotizado = {};
const estadoCliente = {};

let socketActivo = null;

const datosCuenta = `🏦 Datos para el pago:
Banco: Bancolombia
Tipo de cuenta: Ahorros
Número: 31000008050
A nombre de: Reformante S.A.S.

💬 Cuando realices el pago, por favor envíame el comprobante para confirmar tu pedido.`;

function limpiarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, "")
    .trim();
}

function corregirErroresOrto(texto) {
  return texto
    .replace(/semento/g, "cemento")
    .replace(/arsos/g, "argos")
    .replace(/cotisar/g, "cotizar")
    .replace(/mececito/g, "necesito")
    .replace(/semento/g, "cemento")
    .replace(/blokeo/g, "bloque");
}

function analizarProductoDesdeTexto(texto) {
  const normalizado = limpiarTexto(corregirErroresOrto(texto));
  const resultados = [];
  const nombresDetectados = new Set();

  for (const producto of productos) {
    const nombreProducto = limpiarTexto(producto.nombre);
    const palabrasClave = nombreProducto.split(" ");

    const todasClave = palabrasClave.every(p => normalizado.includes(p));
    if (!todasClave) continue;

    const cantidadMatch = normalizado.match(
      new RegExp(`(\d+)\s+(de\s+)?${palabrasClave[0]}`, "i")
    );
    const cantidad = cantidadMatch ? parseInt(cantidadMatch[1]) : 1;

    if (!nombresDetectados.has(producto.nombre)) {
      const precioUnitario = Math.round(producto.precio * 1.19);
      const total = precioUnitario * cantidad;
      resultados.push({
        nombre: producto.nombre,
        cantidad,
        precioUnitario,
        total
      });
      nombresDetectados.add(producto.nombre);
    }
  }

  return resultados.length > 0 ? resultados : null;
}

function sugerirOpcionesSiProductoGenerico(texto) {
  const mensaje = limpiarTexto(texto);
  if (mensaje.includes("cemento")) {
    const opciones = productos
      .filter(p => limpiarTexto(p.nombre).includes("cemento"))
      .map(p => `• ${p.nombre} – $${Math.round(p.precio * 1.19).toLocaleString()}`)
      .join("\n");
    return `Claro que sí. Estas son las opciones de cemento que tenemos:\n${opciones}\n¿Cuál deseas cotizar?`;
  }
  return null;
}

function generarResumenPedido(pedido) {
  if (!pedido || pedido.length === 0) return null;
  let total = 0;
  const lineas = pedido.map(p => {
    const subtotal = p.precioUnitario * p.cantidad;
    total += subtotal;
    return `• ${p.nombre} – ${p.cantidad} x $${p.precioUnitario.toLocaleString()} = $${subtotal.toLocaleString()}`;
  });
  return `🤲 Cotización actual:\n${lineas.join("\n")}\n💰 Total con IVA incluido: $${total.toLocaleString()}`;
}

async function iniciarBot() {
  if (socketActivo) return;
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({ version, printQRInTerminal: false, auth: state });
  socketActivo = sock;

  sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.clear();
      console.log("📲 Escanea este código QR para conectar:");
      qrcode.generate(qr, { small: true });
    }
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) iniciarBot();
    }
    if (connection === "open") {
      console.log("✅ Bot conectado correctamente a WhatsApp.");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const mensaje = messages[0];
    if (!mensaje.message || mensaje.key.fromMe) return;

    const numero = mensaje.key.remoteJid;
    const textoOriginal = mensaje.message.conversation || mensaje.message.extendedTextMessage?.text;
    const imagenRecibida = mensaje.message.imageMessage;

    if (!historialClientes[numero]) historialClientes[numero] = [];
    if (!pedidosAcumulados[numero]) pedidosAcumulados[numero] = [];
    if (!yaCotizado[numero]) yaCotizado[numero] = [];
    if (!estadoCliente[numero]) estadoCliente[numero] = "inicio";

    if (mensaje.message.audioMessage || mensaje.message.voiceMessage) {
      await sock.sendMessage(numero, { text: "📢 Por ahora no escucho audios. ¡Escríbeme por favor!" });
      return;
    }

    if (imagenRecibida && estadoCliente[numero] === "esperando_comprobante") {
      estadoCliente[numero] = "esperando_direccion";
      await sock.sendMessage(numero, {
        text: "🏠 Gracias por enviar el comprobante. ¿Me confirmas tu dirección exacta para organizar el despacho? Si estás cerca lo llevamos hoy mismo. Si estás lejos, coordinamos con el conductor. ✈️"
      });
      return;
    }

    if (!textoOriginal) return;
    const texto = corregirErroresOrto(textoOriginal);
    const textoClave = limpiarTexto(texto);
    const yaRespondido = yaCotizado[numero].includes(textoClave);
    const ultimoMensaje = historialClientes[numero].slice(-1)[0]?.content?.trim().toLowerCase();
    if (textoClave === ultimoMensaje) return;

    if (/(me los despacha|envíemelos|tráemelos|enviame|mandalos)/i.test(texto)) {
      if (pedidosAcumulados[numero].length > 0) {
        estadoCliente[numero] = "esperando_comprobante";
        await sock.sendMessage(numero, {
          text: "🚚 Apenas verifiquemos el comprobante de pago, organizamos el pedido. ¡Puedes enviarlo cuando gustes!"
        });
        return;
      }
    }

    if (/(quiero comprar|dame la cuenta|cómo pago|necesito pagar|ya transferí|transferencia)/i.test(texto)) {
      estadoCliente[numero] = "esperando_comprobante";
      await sock.sendMessage(numero, { text: datosCuenta });
      return;
    }

    if (estadoCliente[numero] === "pedido_confirmado") {
      await sock.sendMessage(numero, { text: "✅ Ya tenemos tu pedido confirmado. Si necesitas algo más, aquí estoy." });
      return;
    }

    const sugerencia = sugerirOpcionesSiProductoGenerico(texto);
    if (sugerencia) {
      historialClientes[numero].push({ role: "assistant", content: sugerencia });
      await sock.sendMessage(numero, { text: sugerencia });
      return;
    }

    const infoProductos = analizarProductoDesdeTexto(texto);
    if (infoProductos && !yaRespondido) {
      const nombresExistentes = new Set(pedidosAcumulados[numero].map(p => p.nombre));
      const nuevosFiltrados = infoProductos.filter(p => !nombresExistentes.has(p.nombre));

      pedidosAcumulados[numero].push(...nuevosFiltrados);
      yaCotizado[numero].push(textoClave);

      const resumen = generarResumenPedido(pedidosAcumulados[numero]);
      historialClientes[numero].push({ role: "assistant", content: resumen });
      await sock.sendMessage(numero, { text: resumen });
      return;
    }

    historialClientes[numero].push({ role: "user", content: texto });
    const respuesta = await obtenerRespuestaIA(historialClientes[numero]);
    historialClientes[numero].push({ role: "assistant", content: respuesta });
    await sock.sendMessage(numero, { text: respuesta });
  });

  sock.ev.on("creds.update", saveCreds);
}

iniciarBot();
