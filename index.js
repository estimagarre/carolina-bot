import express from "express";
import fs from "fs";
import dotenv from "dotenv";
import { obtenerRespuestaIA } from "./openai.js";

dotenv.config();

const app = express();
app.use(express.json());

const productos = JSON.parse(fs.readFileSync("productos_reformante.json", "utf8"));
const historialClientes = {};
const pedidosAcumulados = {};
const yaCotizado = {};
const estadoCliente = {};

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
      new RegExp(`(\\d+)\\s+(de\\s+)?${palabrasClave[0]}`, "i")
    );
    const cantidad = cantidadMatch ? parseInt(cantidadMatch[1]) : 1;

    if (!nombresDetectados.has(producto.nombre)) {
      const precioUnitario = Math.round(producto.precio * 1.19);
      const total = precioUnitario * cantidad;
      resultados.push({ nombre: producto.nombre, cantidad, precioUnitario, total });
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

/** ✅ Validación del webhook */
app.get("/webhook", (req, res) => {
  const verifyToken = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token && mode === "subscribe" && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/** 🚀 Webhook principal que recibe los mensajes */
app.post("/webhook", async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log("❌ Cuerpo vacío recibido.");
      return res.status(200).send("OK");
    }

    const payload = req.body;
    const message = payload.message?.text || "";
    const phone = payload.sender?.phone || payload.sender || "";

    console.log("📥 MENSAJE RECIBIDO:");
    console.log("Número:", phone);
    console.log("Mensaje:", message);

    if (!message || !phone) {
      console.log("❌ Falta mensaje o número.");
      return res.sendStatus(200);
    }

    if (!historialClientes[phone]) historialClientes[phone] = [];
    if (!pedidosAcumulados[phone]) pedidosAcumulados[phone] = [];
    if (!yaCotizado[phone]) yaCotizado[phone] = [];
    if (!estadoCliente[phone]) estadoCliente[phone] = "inicio";

    const texto = corregirErroresOrto(message);
    const textoClave = limpiarTexto(texto);
    const yaRespondido = yaCotizado[phone].includes(textoClave);
    const ultimoMensaje = historialClientes[phone].slice(-1)[0]?.content?.trim().toLowerCase();
    if (textoClave === ultimoMensaje) {
      console.log("⚠️ Mensaje repetido, no se responde.");
      return res.sendStatus(200);
    }

    let respuesta = "";

    if (/(me los despacha|envíemelos|tráemelos|enviame|mandalos)/i.test(texto)) {
      if (pedidosAcumulados[phone].length > 0) {
        estadoCliente[phone] = "esperando_comprobante";
        respuesta = "Apenas verifiquemos el comprobante de pago, organizamos el pedido. ¡Puedes enviarlo cuando gustes!";
      }
    } else if (/(quiero comprar|dame la cuenta|cómo pago|necesito pagar|ya transferí|transferencia)/i.test(texto)) {
      estadoCliente[phone] = "esperando_comprobante";
      respuesta = datosCuenta;
    } else if (estadoCliente[phone] === "pedido_confirmado") {
      respuesta = "Ya tenemos tu pedido confirmado. Si necesitas algo más, aquí estoy.";
    } else {
      const sugerencia = sugerirOpcionesSiProductoGenerico(texto);
      if (sugerencia) {
        historialClientes[phone].push({ role: "assistant", content: sugerencia });
        respuesta = sugerencia;
      } else {
        const infoProductos = analizarProductoDesdeTexto(texto);
        if (infoProductos && !yaRespondido) {
          const nombresExistentes = new Set(pedidosAcumulados[phone].map(p => p.nombre));
          const nuevosFiltrados = infoProductos.filter(p => !nombresExistentes.has(p.nombre));
          pedidosAcumulados[phone].push(...nuevosFiltrados);
          yaCotizado[phone].push(textoClave);
          respuesta = generarResumenPedido(pedidosAcumulados[phone]);
        } else {
          historialClientes[phone].push({ role: "user", content: texto });
          respuesta = await obtenerRespuestaIA(historialClientes[phone], phone);
        }
      }
    }

    historialClientes[phone].push({ role: "assistant", content: respuesta });

    console.log("🤖 RESPUESTA:");
    console.log(respuesta);

    return res.json({ reply: respuesta });

  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
    return res.sendStatus(500);
  }
});

/** ✅ Ruta de prueba */
app.get("/", (req, res) => {
  res.send("✅ Bot funcionando correctamente.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor funcionando en el puerto ${PORT}`);
});
