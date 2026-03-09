const db = require("../config/db");

exports.getServiceOrders = async (req, res) => {
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
        console.error("Error listando ordenes de servicio:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getServiceOrder = async (req, res) => {
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
};

exports.createServiceOrder = async (req, res) => {
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
            estimated_delivery = null,
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
                estimated_delivery || null,
            ]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            id_service_order: result.insertId,
            order_number: orderNumber,
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error creando orden de servicio:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateServiceOrder = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const {
            id_prospect,
            service_type,
            description,
            priority,
            status,
            start_date,
            estimated_delivery,
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
                id,
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
};

exports.deleteServiceOrder = async (req, res) => {
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
};
