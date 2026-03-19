const db = require("../config/db");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

let cachedPdfLogoPath = null;

function decodeHtmlEntities(value = "") {
    const namedMap = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&aacute;": "á",
        "&eacute;": "é",
        "&iacute;": "í",
        "&oacute;": "ó",
        "&uacute;": "ú",
        "&Aacute;": "Á",
        "&Eacute;": "É",
        "&Iacute;": "Í",
        "&Oacute;": "Ó",
        "&Uacute;": "Ú",
        "&ntilde;": "ñ",
        "&Ntilde;": "Ñ",
        "&uuml;": "ü",
        "&Uuml;": "Ü",
        "&iexcl;": "¡",
        "&iquest;": "¿"
    };

    let decoded = String(value);

    decoded = decoded.replace(/&#(\d+);/g, (_, num) => {
        const code = Number(num);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });

    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
    });

    for (const [entity, char] of Object.entries(namedMap)) {
        decoded = decoded.split(entity).join(char);
    }

    return decoded;
}

const PDF_DEFAULTS = {
    fontFamily: "georgia",
    fontSize: 11.25,
    lineHeight: 1.6
};

function getPdfLogoPath() {
    if (cachedPdfLogoPath) {
        return cachedPdfLogoPath;
    }

    const candidates = [
        path.join(process.cwd(), "public", "assets", "CTA-Icon.png"),
        path.join(process.cwd(), "public", "assets", "CTA-02_optimizada.png"),
        path.join(process.cwd(), "public", "assets", "CTA-02.png")
    ];

    cachedPdfLogoPath = candidates.find(filePath => fs.existsSync(filePath)) || "";
    return cachedPdfLogoPath;
}

/* function drawPdfTemplate(doc) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 80;

    doc.save();
    doc.rect(0, 0, pageWidth, 95).fill("#ffffff");
    doc.rect(0, pageHeight - 40, pageWidth, 40).fill("#1b4675");
    doc.restore();

    const logoPath = path.join(process.cwd(), "public", "assets", "CTA-02.png");
    if (fs.existsSync(logoPath)) {
        doc.image(logoPath, margin, 18, { width: 50 });
    }

    doc.fillColor("#111").font("Helvetica-Bold").fontSize(20)
        .text("Bitácora de la Reunión", 0, 52, {
            width: pageWidth,
            align: "center"
        });

    return {
        contentTop: 120,
        contentBottom: pageHeight - 58,
        margin
    };
} */

function drawPdfPageDecorations(doc, { showTitle = false } = {}) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 80;

    // Footer azul en TODAS las páginas
    doc.save();
    doc.rect(0, pageHeight - 40, pageWidth, 40).fill("#1b4675");
    doc.restore();

    // Logo en todas las páginas, con asset ligero en caché
    const logoPath = getPdfLogoPath();
    if (logoPath) {
        doc.image(logoPath, margin, 30, { width: 80 });
    }

    if (!showTitle) {
        return;
    }

    doc.fillColor("#111").font("Helvetica-Bold").fontSize(20)
        .text("Bitácora de la Reunión", 0, 104, {
            width: pageWidth,
            align: "center"
        });
}

function parseInlineStyleFromTag(tag = "") {
    const parsed = {
        fontSize: null,
        fontFamily: null,
        bold: null,
        italic: null,
        underline: null
    };

    const styleMatch = String(tag).match(/style\s*=\s*(["'])(.*?)\1/i);
    const styleText = styleMatch ? styleMatch[2] : "";

    if (styleText) {
        const declarations = styleText.split(";").map(v => v.trim()).filter(Boolean);
        for (const declaration of declarations) {
            const parts = declaration.split(":");
            if (parts.length < 2) {
                continue;
            }

            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(":").trim();

            if (key === "font-size") {
                const num = parseFloat(value);
                if (Number.isFinite(num)) {
                    const size = /px/i.test(value) ? num * 0.75 : num;
                    parsed.fontSize = Math.max(8, Math.min(22, Math.round(size * 10) / 10));
                }
            }

            if (key === "font-family") {
                parsed.fontFamily = value.replace(/["']/g, "").split(",")[0].trim();
            }

            if (key === "font-weight") {
                if (/bold|[6-9]00/i.test(value)) {
                    parsed.bold = true;
                }
            }

            if (key === "font-style" && /italic/i.test(value)) {
                parsed.italic = true;
            }

            if (key === "text-decoration" && /underline/i.test(value)) {
                parsed.underline = true;
            }
        }
    }

    const faceMatch = String(tag).match(/face\s*=\s*(["'])(.*?)\1/i);
    if (faceMatch && faceMatch[2]) {
        parsed.fontFamily = faceMatch[2].split(",")[0].trim();
    }

    const sizeMatch = String(tag).match(/size\s*=\s*(["']?)(\d+(?:\.\d+)?)\1/i);
    if (sizeMatch) {
        const htmlSize = Number(sizeMatch[2]);
        if (Number.isFinite(htmlSize)) {
            parsed.fontSize = Math.max(8, Math.min(22, 8 + htmlSize * 1.6));
        }
    }

    return parsed;
}

// Limpia HTML pesado de TinyMCE para mantener estilo textual sin arrastrar carga inútil.
function sanitizeHtmlForPdf(html = "") {
    return String(html || "")
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/\s(data-[^=\s>]+|contenteditable|spellcheck|aria-[^=\s>]+)\s*=\s*(["']).*?\2/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/>\s+</g, "><");
}

// Convierte HTML a líneas estructuradas para render eficiente en PDF, preservando headings y estilos de TinyMCE.
function htmlToStructuredPdfLines(html = "") {
    const source = String(html || "").replace(/\r/g, "");
    const tokens = source.split(/(<[^>]+>)/g).filter(t => t.trim());

    const headingMap = {
        1: { fontSize: 24, beforeGap: 14, afterGap: 12 },
        2: { fontSize: 20, beforeGap: 12, afterGap: 10 },
        3: { fontSize: 18, beforeGap: 10, afterGap: 9 },
        4: { fontSize: 16, beforeGap: 9, afterGap: 8 },
        5: { fontSize: 14, beforeGap: 8, afterGap: 7 },
        6: { fontSize: 13, beforeGap: 7, afterGap: 6 }
    };

    let bold = false;
    let italic = false;
    let underline = false;
    let listDepth = 0;
    let activeHeadingLevel = null;
    let pendingBeforeGap = 0;
    const inlineStyleStack = [];
    const blockStyleStack = [];

    const lines = [];
    let currentLine = null;

    const currentInlineStyle = () => {
        const merged = {
            fontSize: null,
            fontFamily: null,
            bold: null,
            italic: null,
            underline: null
        };

        for (const style of blockStyleStack) {
            if (!style || typeof style !== "object") {
                continue;
            }
            if (style.fontSize != null) merged.fontSize = style.fontSize;
            if (style.fontFamily) merged.fontFamily = style.fontFamily;
            if (style.bold != null) merged.bold = style.bold;
            if (style.italic != null) merged.italic = style.italic;
            if (style.underline != null) merged.underline = style.underline;
        }

        for (const style of inlineStyleStack) {
            if (!style || typeof style !== "object") {
                continue;
            }
            if (style.fontSize != null) merged.fontSize = style.fontSize;
            if (style.fontFamily) merged.fontFamily = style.fontFamily;
            if (style.bold != null) merged.bold = style.bold;
            if (style.italic != null) merged.italic = style.italic;
            if (style.underline != null) merged.underline = style.underline;
        }

        return merged;
    };

    const ensureLine = (options = {}) => {
        if (!currentLine) {
            currentLine = {
                segments: [],
                bullet: !!options.bullet,
                indent: options.indent || 0,
                beforeGap: pendingBeforeGap,
                afterGap: 0,
                headingLevel: activeHeadingLevel
            };
            pendingBeforeGap = 0;
        }
        return currentLine;
    };

    const flushLine = ({ forceBlank = false } = {}) => {
        if (!currentLine) {
            if (forceBlank) {
                lines.push({ blank: true });
            }
            return;
        }

        const hasContent = currentLine.segments.some(seg => (seg.text || "").trim().length > 0);
        if (hasContent) {
            lines.push(currentLine);
        } else if (forceBlank) {
            lines.push({ blank: true });
        }

        currentLine = null;
    };

    for (const token of tokens) {
        if (token.startsWith("<")) {
            const tag = token.toLowerCase();
            const headingOpen = tag.match(/^<\s*h([1-6])\b/);
            const headingClose = tag.match(/^<\s*\/\s*h([1-6])\s*>/);

            if (/^<\s*br\b/.test(tag)) {
                flushLine({ forceBlank: false });
                continue;
            }

            if (headingOpen) {
                flushLine({ forceBlank: false });
                activeHeadingLevel = Number(headingOpen[1]);
                pendingBeforeGap = Math.max(pendingBeforeGap, headingMap[activeHeadingLevel].beforeGap);
                blockStyleStack.push(parseInlineStyleFromTag(token));
                continue;
            }

            if (headingClose) {
                if (currentLine && currentLine.headingLevel) {
                    currentLine.afterGap = Math.max(currentLine.afterGap || 0, headingMap[currentLine.headingLevel].afterGap);
                }
                flushLine({ forceBlank: false });
                activeHeadingLevel = null;
                if (blockStyleStack.length) {
                    blockStyleStack.pop();
                }
                continue;
            }

            if (/^<\s*(p|div)\b/.test(tag)) {
                flushLine({ forceBlank: false });
                pendingBeforeGap = Math.max(pendingBeforeGap, 5);
                blockStyleStack.push(parseInlineStyleFromTag(token));
                continue;
            }

            if (/^<\s*\/\s*(p|div)\s*>/.test(tag)) {
                flushLine({ forceBlank: false });
                pendingBeforeGap = Math.max(pendingBeforeGap, 5);
                if (blockStyleStack.length) {
                    blockStyleStack.pop();
                }
                continue;
            }

            if (/^<\s*(ul|ol)\b/.test(tag)) {
                listDepth += 1;
                continue;
            }

            if (/^<\s*\/\s*(ul|ol)\s*>/.test(tag)) {
                listDepth = Math.max(0, listDepth - 1);
                flushLine({ forceBlank: false });
                continue;
            }

            if (/^<\s*li\b/.test(tag)) {
                flushLine({ forceBlank: false });
                blockStyleStack.push(parseInlineStyleFromTag(token));
                ensureLine({ bullet: true, indent: Math.max(0, listDepth - 1) });
                continue;
            }

            if (/^<\s*\/\s*li\s*>/.test(tag)) {
                flushLine({ forceBlank: false });
                if (blockStyleStack.length) {
                    blockStyleStack.pop();
                }
                continue;
            }

            if (/^<\s*(strong|b)\b/.test(tag)) {
                bold = true;
                continue;
            }
            if (/^<\s*\/\s*(strong|b)\s*>/.test(tag)) {
                bold = false;
                continue;
            }
            if (/^<\s*(em|i)\b/.test(tag)) {
                italic = true;
                continue;
            }
            if (/^<\s*\/\s*(em|i)\s*>/.test(tag)) {
                italic = false;
                continue;
            }
            if (/^<\s*u\b/.test(tag)) {
                underline = true;
                continue;
            }
            if (/^<\s*\/\s*u\s*>/.test(tag)) {
                underline = false;
                continue;
            }

            if (/^<\s*(span|font)\b/.test(tag)) {
                inlineStyleStack.push(parseInlineStyleFromTag(token));
                continue;
            }

            if (/^<\s*\/\s*(span|font)\s*>/.test(tag)) {
                if (inlineStyleStack.length) {
                    inlineStyleStack.pop();
                }
                continue;
            }

            continue;
        }

        const text = decodeHtmlEntities(token).replace(/\s+/g, " ");
        if (!text.trim()) {
            continue;
        }

        const inlineStyle = currentInlineStyle();
        const line = ensureLine({ bullet: false, indent: Math.max(0, listDepth - 1) });

        const headingStyle = line.headingLevel ? headingMap[line.headingLevel] : null;
        const segmentBold = headingStyle ? true : (inlineStyle.bold != null ? inlineStyle.bold : bold);
        const segmentFontSize = inlineStyle.fontSize != null
            ? inlineStyle.fontSize
            : (headingStyle ? headingStyle.fontSize : null);

        line.segments.push({
            text,
            bold: segmentBold,
            italic: inlineStyle.italic != null ? inlineStyle.italic : italic,
            underline: inlineStyle.underline != null ? inlineStyle.underline : underline,
            fontSize: segmentFontSize != null ? segmentFontSize : PDF_DEFAULTS.fontSize,
            fontFamily: inlineStyle.fontFamily || PDF_DEFAULTS.fontFamily
        });
    }

    flushLine({ forceBlank: false });

    return lines;
}

function getPdfFontName({ bold = false, italic = false }) {
    return getPdfFontByFamily({ family: "helvetica", bold, italic });
}

function getPdfFontByFamily({ family = "", bold = false, italic = false }) {
    const normalized = String(family || "").toLowerCase();

    let baseFamily = "Helvetica";
    if (normalized.includes("times") || normalized.includes("georgia") || normalized.includes("palatino") || normalized.includes("serif")) {
        baseFamily = "Times-Roman";
    } else if (normalized.includes("courier") || normalized.includes("mono")) {
        baseFamily = "Courier";
    } else if (
        normalized.includes("arial")
        || normalized.includes("verdana")
        || normalized.includes("tahoma")
        || normalized.includes("trebuchet")
        || normalized.includes("roboto")
        || normalized.includes("helvetica")
        || normalized.includes("comic")
        || normalized.includes("sans")
    ) {
        baseFamily = "Helvetica";
    }

    if (baseFamily === "Times-Roman") {
        if (bold && italic) return "Times-BoldItalic";
        if (bold) return "Times-Bold";
        if (italic) return "Times-Italic";
        return "Times-Roman";
    }

    if (baseFamily === "Courier") {
        if (bold && italic) return "Courier-BoldOblique";
        if (bold) return "Courier-Bold";
        if (italic) return "Courier-Oblique";
        return "Courier";
    }

    if (bold && italic) {
        return "Helvetica-BoldOblique";
    }
    if (bold) {
        return "Helvetica-Bold";
    }
    if (italic) {
        return "Helvetica-Oblique";
    }
    return "Helvetica";
}

// Dibuja una línea con viñeta y segmentos de estilo, minimizando llamadas de render.
function drawFormattedPdfLine(doc, line, { x, width, isLastLine = false }) {
    if (line.blank) {
        const blankGap = 8;
        const maxY = doc.page.maxY ? doc.page.maxY() : (doc.page.height - doc.page.margins.bottom);
        if (!isLastLine && doc.y + blankGap < maxY) {
            doc.y += blankGap;
        }
        return;
    }

    if (line.beforeGap) {
        doc.y += line.beforeGap;
    }

    // Indentación más agresiva: 40px por nivel de anidamiento
    const indentOffset = (line.indent || 0) * 40;
    const bulletOffset = line.bullet ? 16 : 0;
    const textX = x + indentOffset + bulletOffset;
    const textWidth = Math.max(50, width - indentOffset - bulletOffset);
    const lineStartY = doc.y;

    if (line.bullet) {
        doc.font("Helvetica-Bold").fontSize(12).fillColor("#111")
            .text("•", x + indentOffset, lineStartY, {
                width: 14,
                align: "left",
                lineBreak: false
            });
    }

    const segments = Array.isArray(line.segments) ? line.segments : [];
    if (!segments.length) {
        doc.moveDown(0.25);
        return;
    }

    const mergedSegments = [];
    for (const segment of segments) {
        const previous = mergedSegments[mergedSegments.length - 1];
        const sameStyle = previous
            && previous.bold === segment.bold
            && previous.italic === segment.italic
            && previous.underline === segment.underline
            && previous.fontSize === segment.fontSize
            && previous.fontFamily === segment.fontFamily;

        if (sameStyle) {
            previous.text += segment.text;
        } else {
            mergedSegments.push({ ...segment });
        }
    }

    mergedSegments.forEach((segment, index) => {
        const fontName = getPdfFontByFamily({
            family: segment.fontFamily,
            bold: !!segment.bold,
            italic: !!segment.italic
        });

        const fontSize = Number.isFinite(segment.fontSize) ? segment.fontSize : PDF_DEFAULTS.fontSize;
        const lineGap = Math.max(2, (fontSize * PDF_DEFAULTS.lineHeight) - fontSize);

        doc
            .font(fontName)
            .fontSize(fontSize)
            .fillColor("#111")
            .text(segment.text, index === 0 ? textX : undefined, index === 0 ? lineStartY : undefined, {
                width: textWidth,
                align: "left",
                lineGap,
                underline: !!segment.underline,
                continued: index < mergedSegments.length - 1
            });
    });

    const trailingGap = line.afterGap != null ? line.afterGap : 4;
    const maxY = doc.page.maxY ? doc.page.maxY() : (doc.page.height - doc.page.margins.bottom);
    if (!isLastLine && doc.y + trailingGap < maxY) {
        doc.y += trailingGap;
    }
}

exports.getAll = async (req, res) => {
    const search = req.query.search || "";

    try {
        const [rows] = await db.query(
            `SELECT * FROM bitacoras
             WHERE titulo LIKE ? 
             ORDER BY created_at DESC`,
            [`%${search}%`]
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error obteniendo bitácoras:", error);
        res.status(500).json({ success: false, message: "Error al obtener bitácoras" });
    }
};

exports.getOne = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT * FROM bitacoras
             WHERE id_bitacora = ?`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Bitácora no encontrada" });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error("Error obteniendo bitácora:", error);
        res.status(500).json({ success: false, message: "Error al obtener la bitácora" });
    }
};

exports.create = async (req, res) => {
    const { titulo, contenido } = req.body;
    const id_usuario = req.user?.id;

    if (!titulo || !contenido) {
        return res.status(400).json({ success: false, message: "Título y contenido son requeridos" });
    }

    const preview = contenido.replace(/<[^>]+>/g, "").slice(0, 150);

    try {
        await db.query(
            `INSERT INTO bitacoras
             (titulo, contenido, preview, id_usuario)
             VALUES (?, ?, ?, ?)`,
            [titulo, contenido, preview, id_usuario]
        );

        res.json({ success: true, message: "Bitácora creada exitosamente" });
    } catch (error) {
        console.error("Error creando bitácora:", error);
        res.status(500).json({ success: false, message: "Error al crear la bitácora" });
    }
};

exports.update = async (req, res) => {
    const { titulo, contenido } = req.body;

    if (!titulo || !contenido) {
        return res.status(400).json({ success: false, message: "Título y contenido son requeridos" });
    }

    const preview = contenido.replace(/<[^>]+>/g, "").slice(0, 150);

    try {
        await db.query(
            `UPDATE bitacoras
             SET titulo = ?, contenido = ?, preview = ?
             WHERE id_bitacora = ?`,
            [titulo, contenido, preview, req.params.id]
        );

        res.json({ success: true, message: "Bitácora actualizada exitosamente" });
    } catch (error) {
        console.error("Error actualizando bitácora:", error);
        res.status(500).json({ success: false, message: "Error al actualizar la bitácora" });
    }
};

exports.remove = async (req, res) => {
    try {
        await db.query(
            `DELETE FROM bitacoras 
             WHERE id_bitacora = ?`,
            [req.params.id]
        );

        res.json({ success: true, message: "Bitácora eliminada exitosamente" });
    } catch (error) {
        console.error("Error eliminando bitácora:", error);
        res.status(500).json({ success: false, message: "Error al eliminar la bitácora" });
    }
};

exports.exportPdf = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT contenido
             FROM bitacoras
             WHERE id_bitacora = ?`,
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Bitácora no encontrada" });
        }

        const cleanedHtmlForPdf = sanitizeHtmlForPdf(rows[0].contenido || "");
        const structuredLines = htmlToStructuredPdfLines(cleanedHtmlForPdf);

        while (structuredLines.length > 0) {
            const lastLine = structuredLines[structuredLines.length - 1];
            if (lastLine?.blank) {
                structuredLines.pop();
                continue;
            }

            const hasSegments = Array.isArray(lastLine?.segments) && lastLine.segments.some(seg => (seg.text || "").trim().length > 0);
            if (!hasSegments) {
                structuredLines.pop();
                continue;
            }

            break;
        }

        const doc = new PDFDocument({
            size: "A4",
            compress: true,
            autoFirstPage: true,
            margins: {
                top: 165,
                bottom: 58,
                left: 80,
                right: 80
            }
        });
        const fileName = `bitacora-${req.params.id}.pdf`;

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

        doc.pipe(res);

        drawPdfPageDecorations(doc, { showTitle: true });

        doc.on("pageAdded", () => {
            drawPdfPageDecorations(doc, { showTitle: false });
        });

        const contentX = 80;
        const contentWidth = doc.page.width - 160;

        doc.y = 165;

        for (let index = 0; index < structuredLines.length; index += 1) {
            const line = structuredLines[index];
            drawFormattedPdfLine(doc, line, {
                x: contentX,
                width: contentWidth,
                isLastLine: index === structuredLines.length - 1
            });
        }

        doc.end();
    } catch (error) {
        console.error("Error exportando PDF de bitácora:", error);
        res.status(500).json({ success: false, message: "Error al exportar PDF" });
    }
};
