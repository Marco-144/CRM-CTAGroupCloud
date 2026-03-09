const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

function generateCotizacionPDF(res, header, details){

const h = header[0];

const doc = new PDFDocument({margin:50});

res.setHeader("Content-Type","application/pdf");

doc.pipe(res);

const logoPath = path.join(process.cwd(),"public/assets/LOGO HORIZONTAL-02.png");

//Borde derecho para alinear textos
const RIGHT_EDGE = 545;

//Helper para dibujar texto alineado al mismo borde derecho
const textRight = (txt, y, width = 120, options = {}) => {
    const x = RIGHT_EDGE - width;
    const { font, size, ...textOptions } = options;

    if (font) {
    doc.font(font);
    }

    if (size) {
    doc.fontSize(size);
    }

    doc.text(txt, x, y, { width, align: "right", ...textOptions });
};

// ===== LOGO ESTÁTICO =====
logoPath;
if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 60, 60 , { width: 180 });
}

doc.moveDown();

const folioNumber = Number(h.Folio ?? h.folio ?? 0);
const folioValue = String(Number.isFinite(folioNumber) ? folioNumber : 0).padStart(5, "0");
const companyName = String(h.company || "N/A").toUpperCase();

// ===== POLIZA / FOLIO (arriba y más grande) =====
textRight("COTIZACIÓN", 62, 180, { font: "Helvetica-Bold", size: 24 });
textRight(`N° ${folioValue}`, 98, 180, { font: "Helvetica", size: 20 });

// ===== EMPRESA + FECHA (misma altura) =====
doc.font("Helvetica").fontSize(12).text("EMPRESA", 60, 153, { width: 220 });
doc.font("Helvetica-Bold").fontSize(12).text(companyName, 60, 172, { width: 320 });
textRight(`Fecha: ${new Date().toLocaleDateString("es-MX")}`, 178, 180, {
    font: "Helvetica",
    size: 12
});

// ===== CONTACTO =====
doc.fontSize(12).font("Helvetica-Bold").text("CONTACTO DEL CLIENTE", 60, 215, { width: 220 });
doc.fontSize(10).font("Helvetica-Bold").text(String(h.name || "N/A").toUpperCase(), 60, 236, { width: 320 });



// ===== TABLA =====

// Funcion para dibujar celdas de encabezado con fondo
const drawHeaderCell = (x, y, width, height, text, options = {}) => {
    const {
    bgColor = "#1a4977",
    textColor = "white",
    font = "Helvetica-Bold",
    textOffsetY = 4,
    align = "center"
    } = options;

    doc.rect(x, y, width, height).fill(bgColor);
    doc.fillColor(textColor).font(font).text(text, x, y + textOffsetY, {
    width,
    align
    });
    doc.fillColor("black");
};

doc.font("Helvetica-Bold", 10);
drawHeaderCell(60, 290, 49, 16, "#");
drawHeaderCell(108, 290, 175, 16, "Descripción");
drawHeaderCell(283, 290, 72, 16, "Periodicidad");
drawHeaderCell(355, 290, 50, 16, "Cantidad");
drawHeaderCell(405, 290, 70, 16, "Costo Unitario");
drawHeaderCell(475, 290, 80, 16, "Total");

doc.moveDown();
doc.font("Helvetica");

let y = 310;
const paddingY = 4;
const minRowHeight = 20;

const drawRowCellText = (text, x, cellWidth, rowY, rowHeight, align = "center") => {
    const safeText = String(text ?? "");
    const textHeight = doc.heightOfString(safeText, {
    width: cellWidth,
    align
    });
    const textY = rowY + Math.max(0, (rowHeight - textHeight) / 2);

    doc.text(safeText, x, textY, {
    width: cellWidth,
    align
    });
};


details.forEach((c, index) => {

    if (y + 30 > 650) {
        doc.addPage();
        y = 80;
    }

    const total = c.cantidad * c.costo_unitario;

    //Altura dinámica para descripción
    const descHeight = doc.heightOfString(c.descripcion || "", {
    width: 175,
    align: "center"
    });

    //Altura final de la fila
    const rowHeight = Math.max(minRowHeight, descHeight + paddingY * 2);

    // doc.rect(70, y, 510, rowHeight).stroke("#D9D9D9");

    // Dibujar textos centrados verticalmente dentro de la fila
    drawRowCellText(index + 1, 60, 49, y, rowHeight);
    drawRowCellText(c.descripcion || "", 108, 175, y, rowHeight, "left");
    drawRowCellText(c.periodicidad || "", 283, 72, y, rowHeight);
    drawRowCellText(c.cantidad ?? "", 355, 50, y, rowHeight);
    drawRowCellText(`$${Number(c.costo_unitario || 0).toLocaleString()}`, 405, 70, y, rowHeight);
    drawRowCellText(`$${Number(total || 0).toLocaleString()}`, 475, 80, y, rowHeight);

    // Avanzar con altura dinámica
    y += rowHeight;
});

doc.moveDown(2);

// ===== TOTALES =====

const drawTotalsStyled = (doc, h, yStart) => {
    const leftX = 367;
    const rightX = 555;      
    const labelW = 120;
    const taxW = 40;
    const pesoW = 16;
    const amountW = 110;
    const rowH = 26;
    const blue = "#1a4977";

    const subtotal = Number(h.subtotal || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const iva = Number(h.iva || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const total = Number(h.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

    // Posiciones fijas para que quede "justificado" visualmente
    const amountX = rightX - amountW;
    const pesoX = amountX - pesoW;
    const taxX = 430; // columna del 16%

    // SUBTOTAL
    doc.fillColor("black").font("Helvetica").fontSize(10);
    doc.text("Subtotal", leftX, yStart, { width: labelW, align: "left" });
    doc.text("$", 480, yStart, { width: pesoW, align: "center" });
    doc.text(subtotal, amountX, yStart, { width: amountW, align: "right" });

    // Línea negra separadora
    const lineY = yStart + rowH - 2;
    doc.save();
    doc.moveTo(leftX, lineY).lineTo(rightX, lineY).lineWidth(1.5).strokeColor("black").stroke();
    doc.restore();

    // IMPUESTOS
    const yImp = yStart + rowH + 8;
    doc.fillColor("black").font("Helvetica").fontSize(10);
    doc.text("Impuestos", leftX, yImp, { width: labelW, align: "left" });
    doc.text("16%", taxX, yImp, { width: taxW, align: "center" });
    doc.text("$", 480, yImp, { width: pesoW, align: "center" });
    doc.text(iva, amountX, yImp, { width: amountW, align: "right" });

    // TOTAL en caja azul
    const yTot = yImp + rowH + 1;
    const boxH = 20;
    const boxX = 430;           
    const boxW = rightX - boxX;

    doc.save();
    doc.rect(boxX, yTot, boxW, boxH).fill(blue);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(10);
    doc.text("Total", boxX + 12, yTot + 6, { width: 70, align: "left" });
    doc.text("$", 480, yTot + 6, { width: pesoW, align: "center" });
    doc.text(total, amountX, yTot + 6, { width: amountW, align: "right" });
    doc.restore();

    doc.fillColor("black").font("Helvetica");
    return yTot + boxH;
};

drawTotalsStyled(doc, h, y + 180);

// ===== CONDICIONES =====
doc.font("Helvetica-Bold", 8).text("CONDICIONES DE PAGO", 60, 688);
doc.font("Helvetica").text("Los precios están expresados en pesos mexicanos (M.X.N.).");

doc.moveDown();

doc.end();

}

module.exports = generateCotizacionPDF;