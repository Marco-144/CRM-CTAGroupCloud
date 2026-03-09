const db = require("../config/db");
const generatePDF = require("../utils/pdfGenerator");

exports.getCotizaciones = async (req, res) => {
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
        console.error("Error listando cotizaciones:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getCotizacion = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [header] = await db.query(
            `SELECT c.*, p.company AS prospecto
       FROM cotizacion c
       INNER JOIN prospects p ON p.id_prospect = c.id_prospect
       WHERE c.id_cotizacion = ?`,
            [id]
        );

        if (!header.length) {
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        const [details] = await db.query(
            "SELECT * FROM cotizacion_detalle WHERE id_cotizacion = ?",
            [id]
        );

        res.json({ success: true, data: { ...header[0], conceptos: details } });
    } catch (error) {
        console.error("Error obteniendo cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getCotizacionPDF = async (req, res) => {
    try {
        const id = Number(req.params.id);

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
            `SELECT *
       FROM cotizacion_detalle
       WHERE id_cotizacion = ?`,
            [id]
        );

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename=cotizacion_${id}.pdf`);

        generatePDF(res, header, details);
    } catch (error) {
        console.error("Error generando PDF:", error);
        res.status(500).send("Error generando PDF");
    }
};

exports.createCotizacion = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const { id_prospect, moneda, tipo_cambio, conceptos, status = "Activo" } = req.body;

        if (!conceptos || !conceptos.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Sin conceptos" });
        }

        let subtotal = 0;

        for (const c of conceptos) {
            if (moneda === "USD") {
                subtotal += c.cantidad * c.costo_unitario * tipo_cambio;
            } else {
                subtotal += c.cantidad * c.costo_unitario;
            }
        }

        const iva = subtotal * 0.16;
        const total = subtotal + iva;

        const [[folioRow]] = await connection.query(
            `SELECT COALESCE(MAX(Folio), 0) + 1 AS nextFolio
       FROM cotizacion
       FOR UPDATE`
        );

        const [result] = await connection.query(
            `INSERT INTO cotizacion
        (Folio, id_prospect, status, moneda, tipo_cambio, subtotal, iva, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [folioRow.nextFolio, Number(id_prospect), status, moneda, tipo_cambio, subtotal, iva, total]
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
        res.status(201).json({ success: true, folio: folioRow.nextFolio, id_cotizacion });
    } catch (error) {
        await connection.rollback();
        console.error("Error creando cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateCotizacion = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const id = Number(req.params.id);
        const { id_prospect, moneda, tipo_cambio, conceptos, status } = req.body;

        if (!conceptos || !conceptos.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Sin conceptos" });
        }

        let subtotal = 0;

        for (const c of conceptos) {
            if (moneda === "USD") {
                subtotal += c.cantidad * c.costo_unitario * tipo_cambio;
            } else {
                subtotal += c.cantidad * c.costo_unitario;
            }
        }

        const iva = subtotal * 0.16;
        const total = subtotal + iva;

        let statusToSave = status;

        if (!statusToSave) {
            const [[currentCotizacion]] = await connection.query(
                "SELECT status FROM cotizacion WHERE id_cotizacion = ?",
                [id]
            );

            if (!currentCotizacion) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
            }

            statusToSave = currentCotizacion.status || "Activo";
        }

        await connection.query(
            `UPDATE cotizacion
       SET id_prospect = ?, status = ?, moneda = ?, tipo_cambio = ?,
           subtotal = ?, iva = ?, total = ?
       WHERE id_cotizacion = ?`,
            [Number(id_prospect), statusToSave, moneda, tipo_cambio, subtotal, iva, total, id]
        );

        const [detallesActuales] = await connection.query(
            "SELECT id_detalle_cotizacion FROM cotizacion_detalle WHERE id_cotizacion = ?",
            [id]
        );

        const idsActuales = detallesActuales.map((d) => d.id_detalle_cotizacion);
        const idsRecibidos = conceptos
            .filter((c) => c.id_detalle_cotizacion)
            .map((c) => Number(c.id_detalle_cotizacion));

        const idsEliminar = idsActuales.filter((idDb) => !idsRecibidos.includes(Number(idDb)));

        for (const idEliminar of idsEliminar) {
            await connection.query(
                "DELETE FROM cotizacion_detalle WHERE id_detalle_cotizacion = ?",
                [Number(idEliminar)]
            );
        }

        for (const c of conceptos) {
            if (c.id_detalle_cotizacion) {
                await connection.query(
                    `UPDATE cotizacion_detalle
           SET descripcion = ?, periodicidad = ?, cantidad = ?, costo_unitario = ?
           WHERE id_detalle_cotizacion = ?`,
                    [
                        c.descripcion,
                        c.periodicidad,
                        c.cantidad,
                        c.costo_unitario,
                        Number(c.id_detalle_cotizacion)
                    ]
                );
            } else {
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
        console.error("Error actualizando cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.deleteCotizacion = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [result] = await db.query(
            "UPDATE cotizacion SET status = 'Inactivo' WHERE id_cotizacion = ?",
            [id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error desactivando cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.changeStatus = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { status } = req.body;

        if (!["Activo", "Inactivo"].includes(status)) {
            return res.status(400).json({ success: false, message: "Status invalido" });
        }

        const [result] = await db.query(
            "UPDATE cotizacion SET status = ? WHERE id_cotizacion = ?",
            [status, id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error cambiando status:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.completeCotizacion = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [result] = await db.query(
            "UPDATE cotizacion SET status = 'Completada' WHERE id_cotizacion = ?",
            [id]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error completando cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.deletePermanent = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const id = Number(req.params.id);

        const [existing] = await connection.query(
            "SELECT id_cotizacion FROM cotizacion WHERE id_cotizacion = ?",
            [id]
        );

        if (!existing.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        await connection.query("DELETE FROM cotizacion_detalle WHERE id_cotizacion = ?", [id]);
        await connection.query("DELETE FROM cotizacion WHERE id_cotizacion = ?", [id]);

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error("Error eliminando cotizacion:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};
