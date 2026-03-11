const express = require("express");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const bwipjs = require("bwip-js");
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();

app.use(express.static("public"));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const codes = new Map();

// Configurar SendGrid con variable de entorno
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/* GENERAR CODIGO */
function generarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ENVIAR CODIGO */
app.post("/request-code", async (req, res) => {
  const correo = req.body.correo;

  if (!correo.endsWith("@uaeh.edu.mx")) {
    return res.status(400).json({ error: "Solo se permiten correos institucionales" });
  }

  const code = generarCodigo();

  codes.set(correo, {
    code,
    expires: Date.now() + 600000
  });

  try {
    const msg = {
      to: correo,
      from: 'cai.essah.uaeh@gmail.com', // Asegúrate de haber verificado este remitente en SendGrid
      subject: "Código de verificación - CAI ESSAH UAEH",
      text: `Centro de Autoaprendizaje de Idiomas
Escuela Superior de Ciudad Sahagún
Universidad Autónoma del Estado de Hidalgo

Tu código de verificación es: ${code}
Este código expira en 10 minutos.`
    };
    await sgMail.send(msg);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error de SendGrid:", error.response?.body || error);
    res.status(500).json({ error: "Error enviando correo" });
  }
});

/* VERIFICAR CODIGO */
app.post("/verify-code", (req, res) => {
  const { correo, code } = req.body;

  const data = codes.get(correo);

  if (!data) {
    return res.status(400).json({ error: "Primero solicita un código" });
  }

  if (Date.now() > data.expires) {
    codes.delete(correo);
    return res.status(400).json({ error: "Código expirado" });
  }

  if (data.code !== code) {
    return res.status(400).json({ error: "Código incorrecto" });
  }

  codes.delete(correo);
  res.json({ ok: true });
});

/* GENERAR PDF */
app.post("/generar", upload.single("foto"), async (req, res) => {
  const {
    nombre,
    correo,
    cuenta,
    semestre,
    programa,
    materia,
    profesor,
    nivel,
    periodo,
    anio
  } = req.body;

  // Validar cuenta con correo
  const parte = correo.split("@")[0];
  const numeros = parte.match(/\d+/);
  if (!numeros || numeros[0] !== cuenta) {
    return res.send("Error: matrícula no coincide con el correo institucional");
  }

  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  const rojoUAEH = "#8b0000";

  // LOGO
  doc.image("public/logo_uaeh.png", 50, 40, { width: 120 });

  // TEXTO SUPERIOR
  doc.fillColor(rojoUAEH).fontSize(16).text("Universidad Autónoma del Estado de Hidalgo", 175, 40);
  doc.font("Helvetica-Bold").fillColor("black").fontSize(14).text("Escuela Superior de Ciudad Sahagún", 175, 60);
  doc.font("Helvetica").text("Centro de Autoaprendizaje de Idiomas", 175, 80);

  // CÓDIGO DE BARRAS
  try {
    const barcode = await bwipjs.toBuffer({
      bcid: "code128",
      text: cuenta,
      scale: 3,
      height: 10
    });
    doc.image(barcode, 425, 80, { width: 120 });
  } catch (err) {
    console.error("Error generando código de barras:", err);
  }

  // Calcular posición del cuadro de datos
  const barcodeHeight = 40;
  const barcodeBottom = 80 + barcodeHeight;
  const datosTop = barcodeBottom + 20;

  // TÍTULO
  doc.fillColor(rojoUAEH)
    .fontSize(16)
    .text("CAI LEARNING ACTIVITY RECORD", 50, datosTop - 20);

  // CUADRO DE DATOS PERSONALES
  const cuadroAltura = 171;
  doc.rect(50, datosTop, 500, cuadroAltura).stroke();

  // FOTO
  if (req.file) {
    doc.rect(420, datosTop + 10, 120, 150).stroke();
    doc.image(req.file.buffer, 425, datosTop + 15, { width: 110 });
  }

  // DATOS PERSONALES
  doc.fillColor("black").fontSize(11);
  let y = datosTop + 20;

  function campo(titulo, valor) {
    doc.font("Helvetica-Bold").text(titulo, 70, y, { continued: true });
    doc.font("Helvetica").text(" " + valor, { width: 200 });
    y += 18;
  }

  campo("Learner's Name:", nombre);
  campo("ID Number:", cuenta);
  campo("Academic Program:", programa);
  campo("Semester / Group:", semestre);
  campo("Course:", materia);
  campo("Teacher's Name:", profesor);
  campo("English Level:", nivel);
  campo("Academic Period:", periodo + " " + anio);

  // TABLA DE ACTIVIDADES
  const tableTop = datosTop + cuadroAltura + 10;
  const rowHeight = 33;
  const tableHeight = 25 + 12 * rowHeight;

  doc.fontSize(11).font("Helvetica-Bold");

  // Rectángulo exterior
  doc.rect(50, tableTop, 500, tableHeight).stroke();

  // Encabezados
  doc.text("DATE", 70, tableTop + 7);
  doc.text("TIME", 140, tableTop + 7);
  doc.text("AREA", 220, tableTop + 7);
  doc.text("TUTOR'S SIGNATURE", 285, tableTop + 7);
  doc.text("STAMP / OBSERVATIONS", 410, tableTop + 7);

  // Líneas verticales
  const colPos = [50, 120, 190, 280, 400, 550];
  for (let i = 1; i < colPos.length - 1; i++) {
    doc.moveTo(colPos[i], tableTop).lineTo(colPos[i], tableTop + tableHeight).stroke();
  }

  // Filas horizontales
  doc.font("Helvetica");
  for (let i = 0; i < 12; i++) {
    const yLine = tableTop + 25 + i * rowHeight;
    doc.moveTo(50, yLine).lineTo(550, yLine).stroke();
  }

  doc.end();
});

/* SERVIDOR */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor corriendo en puerto " + PORT);
});