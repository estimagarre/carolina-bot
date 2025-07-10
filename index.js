// index.js (versión corregida para Gupshup formato Meta v3)
import express from "express";
import fs from "fs";
import { obtenerRespuestaIA } from "./openai.js";
import dotenv from "dotenv";

dotenv.config();

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

const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const mensaje = value?.messages?.[0];

    if (!mensaje) return res.sendStatus(200);

    const numero = mensaje.from;
    const textoOriginal = mensaje.text?.body || "";

    if (!numero || !textoOriginal) return res.sendStatus(200);

    if (!historialClientes[numero]) historialClientes[numero] = [];
    if (!pedidosAcumulados[numero]) pedidosAcumulados[numero] = [];
    if (!yaCotizado[numero]) yaCotizado[numero] = [];
    if (!estadoCliente[numero]) estadoCliente[numero] = "inicio";

    const texto = corregirErroresOrto(textoOriginal);
    const textoClave = limpiarTexto(texto);
    const yaRespondido = yaCotizado[numero].includes(textoClave);
    const ultimoMensaje = historialClientes[numero].slice(-1)[0]?.content?.trim().toLowerCase();
    if (textoClave === ultimoMensaje) return res.sendStatus(200);

    let respuesta = "";

    if (/(me los despacha|envíemelos|tráemelos|enviame|mandalos)/i.test(texto)) {
      if (pedidosAcumulados[numero].length > 0) {
        estadoCliente[numero] = "esperando_comprobante";
        respuesta = "🚚 Apenas verifiquemos el comprobante de pago, organizamos el pedido. ¡Puedes enviarlo cuando gustes!";
      }
    } else if (/(quiero comprar|dame la cuenta|cómo pago|necesito pagar|ya transferí|transferencia)/i.test(texto)) {
      estadoCliente[numero] = "esperando_comprobante";
      respuesta = datosCuenta;
    } else if (estadoCliente[numero] === "pedido_confirmado") {
      respuesta = "✅ Ya tenemos tu pedido confirmado. Si necesitas algo más, aquí estoy.";
    } else {
      const sugerencia = sugerirOpcionesSiProductoGenerico(texto);
      if (sugerencia) {
        historialClientes[numero].push({ role: "assistant", content: sugerencia });
        respuesta = sugerencia;
      } else {
        const infoProductos = analizarProductoDesdeTexto(texto);
        if (infoProductos && !yaRespondido) {
          const nombresExistentes = new Set(pedidosAcumulados[numero].map(p => p.nombre));
          const nuevosFiltrados = infoProductos.filter(p => !nombresExistentes.has(p.nombre));
          pedidosAcumulados[numero].push(...nuevosFiltrados);
          yaCotizado[numero].push(textoClave);
          respuesta = generarResumenPedido(pedidosAcumulados[numero]);
        } else {
          historialClientes[numero].push({ role: "user", content: texto });
          respuesta = await obtenerRespuestaIA(historialClientes[numero], numero);
        }
      }
    }

    historialClientes[numero].push({ role: "assistant", content: respuesta });
    return res.json({ reply: respuesta });
  } catch (error) {
    console.error("❌ Error
