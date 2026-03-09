require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const routes = require("./server/routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));
app.use("/server/uploads", express.static(path.join(__dirname, "server", "uploads")));

app.use("/api", routes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});


/* const express = require("express");
const cors = require("cors");
require("dotenv").config();
const db = require("./config/db");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const JWT_SECRET = process.env.JWT_SECRET || "change_this_dev_secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "2h";

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7).trim();
}

function authenticateToken(req, res, next) {
  const token = getBearerToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: "Token requerido" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Token inválido o expirado" });
  }
}

// =========================
//   LOGIN
// ========================= 

app.post("/api/login", async (req, res) => {
  try {
    const { user, password } = req.body;

    if (!user || !password) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const [rows] = await db.query(
      `SELECT
         id,
         username,
         password_hash,
         id_department,
         id_role,
         token_version
       FROM users
       WHERE username = ?
       LIMIT 1`,
      [user]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }

    const dbUser = rows[0];
    const isValidPassword = await bcrypt.compare(password, dbUser.password_hash || "");

    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      {
        sub: dbUser.id,
        username: dbUser.username,
        id_department: dbUser.id_department,
        id_role: dbUser.id_role,
        token_version: dbUser.token_version || 0
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success: true,
      token,
      user: {
        id: dbUser.id,
        username: dbUser.username,
        id_department: dbUser.id_department,
        id_role: dbUser.id_role
      }
    });

  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const userId = Number(req.auth.sub);

    const [rows] = await db.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.id_department,
         u.id_role,
         u.token_version,
         d.name AS department,
         r.name AS role
       FROM users u
       INNER JOIN departments d ON d.id_department = u.id_department
       INNER JOIN roles r ON r.id_role = u.id_role
       WHERE u.id = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: "Sesión inválida" });
    }

    const currentUser = rows[0];

    if (Number(currentUser.token_version || 0) !== Number(req.auth.token_version || 0)) {
      return res.status(401).json({ success: false, message: "Sesión expirada" });
    }

    res.json({ success: true, user: currentUser });

  } catch (error) {
    console.error("Error en validación de sesión:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// =========================
//   USERS
// ========================= 

app.get("/api/users", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.id_department,
         u.id_role,
         d.name AS department,
         r.name AS role
       FROM users u
       INNER JOIN departments d ON d.id_department = u.id_department
       INNER JOIN roles r ON r.id_role = u.id_role
       ORDER BY u.id DESC`
    );

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      id_department,
      id_role
    } = req.body;

    if (!username || !email || !password || !id_department || !id_role) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const password_hash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      `INSERT INTO users (username, email, password_hash, id_department, id_role)
       VALUES (?, ?, ?, ?, ?)`,
      [username.trim(), email.trim(), password_hash, Number(id_department), Number(id_role)]
    );

    res.status(201).json({ success: true, id: result.insertId });

  } catch (error) {
    console.error("Error al crear usuario:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.put("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      username,
      email,
      password,
      id_department,
      id_role
    } = req.body;

    if (!username || !email || !id_department || !id_role) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const updates = [
      "username = ?",
      "email = ?",
      "id_department = ?",
      "id_role = ?"
    ];
    const params = [username.trim(), email.trim(), Number(id_department), Number(id_role)];

    if (password) {
      const password_hash = await bcrypt.hash(password, 12);
      updates.push("password_hash = ?");
      params.push(password_hash);
    }

    params.push(Number(id));

    const [result] = await db.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error al actualizar usuario:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.delete("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      "DELETE FROM users WHERE id = ?",
      [Number(id)]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Usuario no encontrado" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error al eliminar usuario:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// =========================
// DEPARTMENTS & ROLES
// ========================= 

app.get("/api/departments", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_department, name
       FROM departments
       ORDER BY name ASC`
    );

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error al obtener departamentos:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/api/roles", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_role, name
       FROM roles
       ORDER BY name ASC`
    );

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error al obtener roles:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// =========================
// PROSPECTOS
// ========================= 

app.get("/api/prospects", async (req, res) => {
  try {
    const { search = "", status = "" } = req.query;

    let query = `
      SELECT id_prospect, name, company, phone, email, priority, status
      FROM prospects
      WHERE 1 = 1
    `;

    const params = [];

    if (search) {
      query += " AND (name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY id_prospect DESC";

    const [rows] = await db.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error al obtener prospectos:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.post("/api/prospects", async (req, res) => {
  try {
    const { name, company, phone, email, priority, status } = req.body;

    if (!name || !company || !priority || !status) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const [result] = await db.query(
      `INSERT INTO prospects (name, company, phone, email, priority, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, company, phone || null, email || null, priority, status]
    );

    res.status(201).json({ success: true, id_prospect: result.insertId });

  } catch (error) {
    console.error("Error al crear prospecto:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.put("/api/prospects/:id_prospect", async (req, res) => {
  try {
    const { id_prospect } = req.params;
    const { name, company, phone, email, priority, status } = req.body;

    if (!name || !company || !priority || !status) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const [result] = await db.query(
      `UPDATE prospects
       SET name = ?, company = ?, phone = ?, email = ?, priority = ?, status = ?
       WHERE id_prospect = ?`,
      [name, company, phone || null, email || null, priority, status, id_prospect]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Prospecto no encontrado" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error al actualizar prospecto:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.delete("/api/prospects/:id_prospect", async (req, res) => {
  try {
    const { id_prospect } = req.params;

    const [result] = await db.query(
      "DELETE FROM prospects WHERE id_prospect = ?",
      [id_prospect]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Prospecto no encontrado" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error al eliminar prospecto:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

// =========================
// COTIZACIONES
// ========================= 

app.get("/api/cotizaciones", async (req, res) => {
  try {
    const { status = "" } = req.query;

    let query = `
      SELECT 
        c.id_cotizacion,
        c.Folio,
        p.company AS prospecto,
        c.status,
        c.moneda,
        c.tipo_cambio,
        c.subtotal,
        c.total,
        c.updated_at,
        (
          SELECT SUM(d.cantidad)
          FROM cotizacion_detalle d
          WHERE d.id_cotizacion = c.id_cotizacion 
        ) AS total_cantidad
      FROM cotizacion c
      INNER JOIN prospects p ON p.id_prospect = c.id_prospect
    `;

    const params = [];

    if (status) {
      query += " WHERE c.status = ?";
      params.push(status);
    }

    query += " ORDER BY c.id_cotizacion DESC";

    const [rows] = await db.query(query, params);

    res.json({ success: true, data: rows });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

app.get("/api/cotizaciones/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const [header] = await db.query(
      `SELECT c.*, p.company AS prospecto
       FROM cotizacion c
       INNER JOIN prospects p ON p.id_prospect = c.id_prospect
       WHERE c.id_cotizacion = ?`,
      [id]
    );

    if (header.length === 0) {
      return res.status(404).json({ success: false });
    }

    const [details] = await db.query(
      "SELECT * FROM cotizacion_detalle WHERE id_cotizacion = ?",
      [id]
    );

    res.json({
      success: true,
      data: {
        ...header[0],
        conceptos: details
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});


// =========================
// CREAR PDF COTIZACION
// ========================= 

app.get("/api/cotizaciones/:id/pdf", async (req, res) => {
  try {
    const id = req.params.id;

    const [header] = await db.query(
      `SELECT c.*, p.company, p.name, p.email, p.phone
       FROM cotizacion c
       INNER JOIN prospects p ON p.id_prospect = c.id_prospect
       WHERE c.id_cotizacion = ?`,
      [id]
    );

    if (!header.length) {
      return res.status(404).send("No encontrada");
    }

    const [details] = await db.query(
      `SELECT * FROM cotizacion_detalle
       WHERE id_cotizacion = ?`,
      [id]
    );

    const h = header[0];

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=cotizacion_${id}.pdf`);

    doc.pipe(res);

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
    const logoPath = path.join(__dirname, "public/assets/LOGO HORIZONTAL-02.png");
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

    let y = doc.y;
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

  } catch (error) {
    console.error(error);
    res.status(500).send("Error generando PDF");
  }
});


// =========================
//   CREAR COTIZACION
// ========================= 

app.post("/api/cotizaciones", async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const { id_prospect, moneda, tipo_cambio, conceptos, status = "Activo" } = req.body;

    if (!conceptos || conceptos.length === 0) {
      return res.status(400).json({ success: false, message: "Sin conceptos" });
    }

    let subtotal = 0;

    conceptos.forEach(c => {
      if (moneda === "USD") {
        subtotal += c.cantidad * c.costo_unitario * tipo_cambio;
      } else {
        subtotal += c.cantidad * c.costo_unitario;
      }
    });

    const iva = subtotal * 0.16;
    const total = subtotal + iva;

    const [[folioRow]] = await connection.query(
      `SELECT COALESCE(MAX(Folio), 0) + 1 AS nextFolio
       FROM cotizacion
       FOR UPDATE`
    );
    const nextFolio = folioRow.nextFolio;

    const [result] = await connection.query(
      `INSERT INTO cotizacion
       (Folio, id_prospect, status, moneda, tipo_cambio, subtotal, iva, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextFolio, id_prospect, status, moneda, tipo_cambio, subtotal, iva, total]
    );

    const id_cotizacion = result.insertId;

    for (const c of conceptos) {
      await connection.query(
        `INSERT INTO cotizacion_detalle
         (id_cotizacion, descripcion, periodicidad, cantidad, costo_unitario)
         VALUES (?, ?, ?, ?, ?)`,
        [id_cotizacion, c.descripcion, c.periodicidad, c.cantidad, c.costo_unitario]
      );
    }

    await connection.commit();
    res.json({ success: true, folio: nextFolio });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

// =========================
//   EDITAR COTIZACION
// =========================

app.put("/api/cotizaciones/:id", async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const id = req.params.id;
    const { id_prospect, moneda, tipo_cambio, conceptos, status } = req.body;

    if (!conceptos || conceptos.length === 0) {
      return res.status(400).json({ success: false, message: "Sin conceptos" });
    }

    let subtotal = 0;

    conceptos.forEach(c => {
      if (moneda === "USD") {
        subtotal += c.cantidad * c.costo_unitario * tipo_cambio;
      } else {
        subtotal += c.cantidad * c.costo_unitario;
      }
    });

    const iva = subtotal * 0.16;
    const total = subtotal + iva;

    let statusToSave = status;

    if (!statusToSave) {
      const [[currentCotizacion]] = await connection.query(
        "SELECT status FROM cotizacion WHERE id_cotizacion = ?",
        [id]
      );

      if (!currentCotizacion) {
        return res.status(404).json({ success: false, message: "Cotización no encontrada" });
      }

      statusToSave = currentCotizacion.status || "Activo";
    }

    // Actualizar cabecera
    await connection.query(
      `UPDATE cotizacion
       SET id_prospect = ?, status = ?, moneda = ?, tipo_cambio = ?, 
           subtotal = ?, iva = ?, total = ?
       WHERE id_cotizacion = ?`,
      [id_prospect, statusToSave, moneda, tipo_cambio, subtotal, iva, total, id]
    );

    // Obtener detalles actuales
    const [detallesActuales] = await connection.query(
      "SELECT id_detalle_cotizacion FROM cotizacion_detalle WHERE id_cotizacion = ?",
      [id]
    );

    const idsActuales = detallesActuales.map(d => d.id_detalle_cotizacion);
    const idsRecibidos = conceptos.filter(c => c.id_detalle_cotizacion).map(c => c.id_detalle_cotizacion);

    // Eliminar los que ya no vienen
    const idsEliminar = idsActuales.filter(idDB => !idsRecibidos.includes(idDB));

    for (const idEliminar of idsEliminar) {
      await connection.query(
        "DELETE FROM cotizacion_detalle WHERE id_detalle_cotizacion = ?",
        [idEliminar]
      );
    }

    // Insertar o actualizar
    for (const c of conceptos) {

      if (c.id_detalle_cotizacion) {
        await connection.query(
          `UPDATE cotizacion_detalle
          SET descripcion = ?, periodicidad = ?, cantidad = ?, costo_unitario = ?
          WHERE id_detalle_cotizacion = ?`,
          [c.descripcion, c.periodicidad, c.cantidad, c.costo_unitario, c.id_detalle_cotizacion]
        );
      } else {
        // INSERT nuevo concepto
        await connection.query(
          `INSERT INTO cotizacion_detalle
           (id_cotizacion, descripcion, periodicidad, cantidad, costo_unitario)
           VALUES (?, ?, ?, ?, ?)`,
          [id, c.descripcion, c.periodicidad, c.cantidad, c.costo_unitario]
        );
      }
    }

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

// =========================
//   ELIMINAR COTIZACION 
// =========================


app.delete("/api/cotizaciones/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const [result] = await db.query(
      "UPDATE cotizacion SET status = 'Inactivo' WHERE id_cotizacion = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Cotización no encontrada" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

app.patch("/api/cotizaciones/:id/status", async (req, res) => {
  try {
    const id = req.params.id;
    const { status } = req.body;

    if (!["Activo", "Inactivo"].includes(status)) {
      return res.status(400).json({ success: false, message: "Status inválido" });
    }

    const [result] = await db.query(
      "UPDATE cotizacion SET status = ? WHERE id_cotizacion = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Cotización no encontrada" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});

app.patch("/api/cotizaciones/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [result] = await db.query(
      "UPDATE cotizacion SET status = 'Completada' WHERE id_cotizacion = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Cotización no encontrada" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.delete("/api/cotizaciones/:id/permanent", async (req, res) => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    const id = req.params.id;

    const [existing] = await connection.query(
      "SELECT id_cotizacion FROM cotizacion WHERE id_cotizacion = ?",
      [id]
    );

    if (!existing.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Cotización no encontrada" });
    }

    await connection.query(
      "DELETE FROM cotizacion_detalle WHERE id_cotizacion = ?",
      [id]
    );

    await connection.query(
      "DELETE FROM cotizacion WHERE id_cotizacion = ?",
      [id]
    );

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ success: false });
  } finally {
    connection.release();
  }
});

// =========================
// SERVICE ORDERS  
// =========================

app.get("/api/service-orders", async (req, res) => {
  try {
    const { search = "", status = "", priority = "" } = req.query;

    let query = `
      SELECT
        so.id_service_order,
        so.order_number,
        so.id_prospect,
        so.id_created_by,
        so.service_type,
        so.description,
        so.priority,
        so.status,
        so.start_date,
        so.estimated_delivery,
        so.created_at,
        so.updated_at,
        p.company AS prospecto,
        u.username AS created_by,
        (
          SELECT COUNT(*)
          FROM tickets t
          WHERE t.id_service_order = so.id_service_order
        ) AS total_tickets
      FROM service_orders so
      LEFT JOIN prospects p ON p.id_prospect = so.id_prospect
      LEFT JOIN users u ON u.id = so.id_created_by
      WHERE 1 = 1
    `;

    const params = [];

    if (search) {
      const searchTerm = `%${search}%`;
      query += `
        AND (
          so.order_number LIKE ?
          OR p.company LIKE ?
          OR so.service_type LIKE ?
          OR so.description LIKE ?
        )
      `;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += " AND so.status = ?";
      params.push(status);
    }

    if (priority) {
      query += " AND so.priority = ?";
      params.push(priority);
    }

    query += " ORDER BY so.id_service_order DESC";

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error listando órdenes de servicio:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/api/service-orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await db.query(
      `SELECT
        so.*,
        p.company AS prospecto,
        u.username AS created_by
      FROM service_orders so
      LEFT JOIN prospects p ON p.id_prospect = so.id_prospect
      LEFT JOIN users u ON u.id = so.id_created_by
      WHERE so.id_service_order = ?
      LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Orden no encontrada" });
    }

    const [tickets] = await db.query(
      `SELECT
        id_ticket,
        ticket_number,
        subject,
        description,
        priority,
        status,
        ticket_type,
        due_date,
        created_at
      FROM tickets
      WHERE id_service_order = ?
      ORDER BY id_ticket DESC`,
      [id]
    );

    res.json({ success: true, data: { ...rows[0], tickets } });

  } catch (error) {
    console.error("Error obteniendo orden de servicio:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.post("/api/service-orders", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      id_prospect,
      id_created_by,
      service_type,
      description,
      priority = "medio",
      status = "pendiente",
      start_date = null,
      estimated_delivery = null
    } = req.body;

    if (!id_prospect || !service_type) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Prospecto y tipo de servicio son obligatorios" });
    }

    const [[nextRow]] = await connection.query(
      `SELECT COALESCE(MAX(id_service_order), 0) + 1 AS nextId
       FROM service_orders
       FOR UPDATE`
    );

    const orderNumber = `SO-${String(nextRow.nextId).padStart(5, "0")}`;

    const [result] = await connection.query(
      `INSERT INTO service_orders
        (
          order_number,
          id_prospect,
          id_created_by,
          service_type,
          description,
          priority,
          status,
          start_date,
          estimated_delivery
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNumber,
        Number(id_prospect),
        Number(id_created_by || 1),
        String(service_type).trim(),
        description || null,
        String(priority).toLowerCase(),
        String(status).toLowerCase(),
        start_date || null,
        estimated_delivery || null
      ]
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      id_service_order: result.insertId,
      order_number: orderNumber
    });

  } catch (error) {
    await connection.rollback();
    console.error("Error creando orden de servicio:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  } finally {
    connection.release();
  }
});

app.put("/api/service-orders/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      id_prospect,
      service_type,
      description,
      priority,
      status,
      start_date,
      estimated_delivery
    } = req.body;

    if (!id_prospect || !service_type || !priority || !status) {
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const [result] = await db.query(
      `UPDATE service_orders
       SET
        id_prospect = ?,
        service_type = ?,
        description = ?,
        priority = ?,
        status = ?,
        start_date = ?,
        estimated_delivery = ?
       WHERE id_service_order = ?`,
      [
        Number(id_prospect),
        String(service_type).trim(),
        description || null,
        String(priority).toLowerCase(),
        String(status).toLowerCase(),
        start_date || null,
        estimated_delivery || null,
        id
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Orden no encontrada" });
    }

    res.json({ success: true });

  } catch (error) {
    console.error("Error actualizando orden de servicio:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.delete("/api/service-orders/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const id = Number(req.params.id);
    await connection.beginTransaction();

    const [tickets] = await connection.query(
      "SELECT id_ticket FROM tickets WHERE id_service_order = ?",
      [id]
    );

    for (const ticket of tickets) {
      await connection.query("DELETE FROM ticket_responses WHERE id_ticket = ?", [ticket.id_ticket]);
      await connection.query("DELETE FROM ticket_history WHERE id_ticket = ?", [ticket.id_ticket]);
    }

    await connection.query("DELETE FROM tickets WHERE id_service_order = ?", [id]);

    const [result] = await connection.query(
      "DELETE FROM service_orders WHERE id_service_order = ?",
      [id]
    );

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Orden no encontrada" });
    }

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error("Error eliminando orden de servicio:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  } finally {
    connection.release();
  }
});

// =========================
//   TICKETS
// =========================

app.get("/api/tickets", async (req, res) => {
  try {
    const {
      search = "",
      status = "",
      priority = "",
      ticket_type = "",
      id_service_order = ""
    } = req.query;

    let query = `
      SELECT
        t.id_ticket,
        t.ticket_number,
        t.id_service_order,
        so.order_number,
        t.id_prospect,
        p.company AS prospecto,
        t.subject,
        t.description,
        t.id_department,
        d.name AS department,
        t.id_created_by,
        uc.username AS created_by,
        t.id_assigned_user,
        ua.username AS assigned_user,
        t.priority,
        t.status,
        t.ticket_type,
        t.due_date,
        t.created_at,
        t.updated_at
      FROM tickets t
      LEFT JOIN service_orders so ON so.id_service_order = t.id_service_order
      LEFT JOIN prospects p ON p.id_prospect = t.id_prospect
      LEFT JOIN departments d ON d.id_department = t.id_department
      LEFT JOIN users uc ON uc.id = t.id_created_by
      LEFT JOIN users ua ON ua.id = t.id_assigned_user
      WHERE 1 = 1
    `;

    const params = [];

    if (search) {
      const searchTerm = `%${search}%`;
      query += `
        AND (
          t.ticket_number LIKE ?
          OR t.subject LIKE ?
          OR t.description LIKE ?
          OR p.company LIKE ?
          OR so.order_number LIKE ?
        )
      `;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (status) {
      query += " AND t.status = ?";
      params.push(status);
    }

    if (priority) {
      query += " AND t.priority = ?";
      params.push(priority);
    }

    if (ticket_type) {
      query += " AND t.ticket_type = ?";
      params.push(ticket_type);
    }

    if (id_service_order) {
      query += " AND t.id_service_order = ?";
      params.push(Number(id_service_order));
    }

    query += " ORDER BY t.id_ticket DESC";

    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });

  } catch (error) {
    console.error("Error listando tickets:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.get("/api/tickets/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [rows] = await db.query(
      `SELECT
        t.id_ticket,
        t.ticket_number,
        t.id_service_order,
        so.order_number,
        t.id_prospect,
        p.company AS prospecto,
        t.subject,
        t.description,
        t.id_department,
        d.name AS department,
        t.id_created_by,
        uc.username AS created_by,
        t.id_assigned_user,
        ua.username AS assigned_user,
        t.priority,
        t.status,
        t.ticket_type,
        t.due_date,
        t.created_at,
        t.updated_at
      FROM tickets t
      LEFT JOIN service_orders so ON so.id_service_order = t.id_service_order
      LEFT JOIN prospects p ON p.id_prospect = t.id_prospect
      LEFT JOIN departments d ON d.id_department = t.id_department
      LEFT JOIN users uc ON uc.id = t.id_created_by
      LEFT JOIN users ua ON ua.id = t.id_assigned_user
      WHERE t.id_ticket = ?
      LIMIT 1`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Ticket no encontrado" });
    }

    const [responses] = await db.query(
      `SELECT
        tr.id_ticket_responses,
        tr.id_ticket,
        tr.id_user,
        u.username,
        tr.message,
        tr.attachment,
        tr.created_at
      FROM ticket_responses tr
      LEFT JOIN users u ON u.id = tr.id_user
      WHERE tr.id_ticket = ?
      ORDER BY tr.id_ticket_responses ASC`,
      [id]
    );

    const [history] = await db.query(
      `SELECT
        th.id_ticket_history,
        th.id_ticket,
        th.id_user,
        u.username,
        th.field_changed,
        th.old_value,
        th.new_value,
        th.description,
        th.created_at
      FROM ticket_history th
      LEFT JOIN users u ON u.id = th.id_user
      WHERE th.id_ticket = ?
      ORDER BY th.id_ticket_history DESC`,
      [id]
    );

    res.json({ success: true, data: { ...rows[0], responses, history } });

  } catch (error) {
    console.error("Error obteniendo ticket:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  }
});

app.post("/api/tickets", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      id_service_order,
      id_prospect,
      subject,
      description,
      id_department,
      id_created_by,
      id_assigned_user,
      priority = "medio",
      status = "abierto",
      ticket_type = "soporte",
      due_date = null
    } = req.body;

    if (!id_service_order || !id_prospect || !subject || !id_department) {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Datos incompletos" });
    }

    const [[nextRow]] = await connection.query(
      `SELECT COALESCE(MAX(id_ticket), 0) + 1 AS nextId
       FROM tickets
       FOR UPDATE`
    );

    const ticketNumber = `TK-${String(nextRow.nextId).padStart(5, "0")}`;

    const [result] = await connection.query(
      `INSERT INTO tickets
        (
          ticket_number,
          id_service_order,
          id_prospect,
          subject,
          description,
          id_department,
          id_created_by,
          id_assigned_user,
          priority,
          status,
          ticket_type,
          due_date
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ticketNumber,
        Number(id_service_order),
        Number(id_prospect),
        String(subject).trim(),
        description || null,
        Number(id_department),
        Number(id_created_by || 1),
        id_assigned_user ? Number(id_assigned_user) : null,
        String(priority).toLowerCase(),
        String(status).toLowerCase(),
        String(ticket_type).toLowerCase(),
        due_date || null
      ]
    );

    await connection.commit();
    res.status(201).json({
      success: true,
      id_ticket: result.insertId,
      ticket_number: ticketNumber
    });

  } catch (error) {
    await connection.rollback();
    console.error("Error creando ticket:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  } finally {
    connection.release();
  }
});

app.put("/api/tickets/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const id = Number(req.params.id);
    const {
      id_service_order,
      id_prospect,
      subject,
      description,
      id_department,
      id_assigned_user,
      priority,
      status,
      ticket_type,
      due_date,
      id_user
    } = req.body;

    const [existingRows] = await connection.query(
      `SELECT
        id_service_order,
        id_prospect,
        subject,
        description,
        id_department,
        id_assigned_user,
        priority,
        status,
        ticket_type,
        due_date
      FROM tickets
      WHERE id_ticket = ?
      LIMIT 1`,
      [id]
    );

    if (!existingRows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Ticket no encontrado" });
    }

    const existing = existingRows[0];
    const cleanTicketType = String(ticket_type || existing.ticket_type).toLowerCase();

    await connection.query(
      `UPDATE tickets
       SET
        id_service_order = ?,
        id_prospect = ?,
        subject = ?,
        description = ?,
        id_department = ?,
        id_assigned_user = ?,
        priority = ?,
        status = ?,
        ticket_type = ?,
        due_date = ?
       WHERE id_ticket = ?`,
      [
        Number(id_service_order),
        Number(id_prospect),
        String(subject).trim(),
        description || null,
        Number(id_department),
        id_assigned_user ? Number(id_assigned_user) : null,
        String(priority).toLowerCase(),
        String(status).toLowerCase(),
        cleanTicketType,
        due_date || null,
        id
      ]
    );

    const auditUserId = Number(id_user || 1);
    const changes = [
      ["id_service_order", existing.id_service_order, id_service_order],
      ["id_prospect", existing.id_prospect, id_prospect],
      ["subject", existing.subject, subject],
      ["description", existing.description, description],
      ["id_department", existing.id_department, id_department],
      ["id_assigned_user", existing.id_assigned_user, id_assigned_user || null],
      ["priority", existing.priority, String(priority).toLowerCase()],
      ["status", existing.status, String(status).toLowerCase()],
      ["ticket_type", existing.ticket_type, cleanTicketType],
      ["due_date", existing.due_date, due_date || null]
    ];

    for (const [field, oldValue, newValue] of changes) {
      const oldNormalized = oldValue === null || oldValue === undefined ? "" : String(oldValue);
      const newNormalized = newValue === null || newValue === undefined ? "" : String(newValue);

      if (oldNormalized === newNormalized) continue;

      await connection.query(
        `INSERT INTO ticket_history
          (id_ticket, id_user, field_changed, old_value, new_value, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          auditUserId,
          field,
          oldNormalized || null,
          newNormalized || null,
          `Cambio en ${field}`
        ]
      );
    }

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error("Error actualizando ticket:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  } finally {
    connection.release();
  }
});

app.delete("/api/tickets/:id", async (req, res) => {
  const connection = await db.getConnection();

  try {
    const id = Number(req.params.id);
    await connection.beginTransaction();

    await connection.query("DELETE FROM ticket_responses WHERE id_ticket = ?", [id]);
    await connection.query("DELETE FROM ticket_history WHERE id_ticket = ?", [id]);

    const [result] = await connection.query("DELETE FROM tickets WHERE id_ticket = ?", [id]);

    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Ticket no encontrado" });
    }

    await connection.commit();
    res.json({ success: true });

  } catch (error) {
    await connection.rollback();
    console.error("Error eliminando ticket:", error);
    res.status(500).json({ success: false, message: "Error del servidor" });
  } finally {
    connection.release();
  }
});



const PORT =   process.env.PORT ||  3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
}); */