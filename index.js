
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
    .replace(/[̀-ͯ]/g, "")
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
      new RegExp(`(\d+)\s+(de\s+)?${palabrasClave[0]}`, "i")
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

app.post("/webhook", async (req, res) => {
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const texto = message.text?.body || "";
    const phone = message.from;

    console.log("📩 Mensaje recibido:", texto, "de", phone);

    if (!texto || !phone) return res.sendStatus(200);

    if (!historialClientes[phone]) historialClientes[phone] = [];
    if (!pedidosAcumulados[phone]) pedidosAcumulados[phone] = [];
    if (!yaCotizado[phone]) yaCotizado[phone] = [];
    if (!estadoCliente[phone]) estadoCliente[phone] = "inicio";

    const textoCorregido = corregirErroresOrto(texto);
    const textoClave = limpiarTexto(textoCorregido);

    let respuesta = "";

    const sugerencia = sugerirOpcionesSiProductoGenerico(textoCorregido);
    if (sugerencia) {
      respuesta = sugerencia;
    } else {
      const infoProductos = analizarProductoDesdeTexto(textoCorregido);
      if (infoProductos) {
        pedidosAcumulados[phone].push(...infoProductos);
        respuesta = generarResumenPedido(pedidosAcumulados[phone]);
      } else {
        historialClientes[phone].push({ role: "user", content: texto });
        respuesta = await obtenerRespuestaIA(historialClientes[phone], phone);
      }
    }

    historialClientes[phone].push({ role: "assistant", content: respuesta });

    res.json({
      reply: respuesta
    });

  } catch (error) {
    console.error("❌ Error en webhook:", error.message);
    return res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor funcionando en el puerto ${PORT}`);
});
