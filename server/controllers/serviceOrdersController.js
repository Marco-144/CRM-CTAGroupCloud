const db = require("../config/db");

async function refreshTicketHasServiceOrder(connection, ticketId) {
    const safeTicketId = Number(ticketId || 0);
    if (!safeTicketId) return;

    const [[countRow]] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM service_orders
         WHERE id_ticket = ?`,
        [safeTicketId]
    );

    const hasServiceOrder = Number(countRow?.total || 0) > 0 ? 1 : 0;

    await connection.query(
        `UPDATE tickets
         SET has_service_order = ?
         WHERE id_ticket = ?`,
        [hasServiceOrder, safeTicketId]
    );
}

exports.getServiceOrders = async (req, res) => {
    try {
        const { search = "", status = "", priority = "", id_ticket = "" } = req.query;

        let query = `
            SELECT
                so.id_service_order,
                so.order_number,
                so.id_ticket,
                t.ticket_number,
                so.id_prospect,
                so.id_created_by,
                so.id_assigned_user,
                so.service_type,
                so.description,
                so.priority,
                so.status,
                so.start_date,
                so.estimated_delivery,
                so.created_at,
                so.updated_at,
                p.company AS cliente,
                uc.username AS created_by,
                ua.username AS assigned_user
            FROM service_orders so
            LEFT JOIN tickets t ON t.id_ticket = so.id_ticket
            LEFT JOIN prospects p ON p.id_prospect = so.id_prospect AND COALESCE(p.is_client, 0) = 1
            LEFT JOIN users uc ON uc.id = so.id_created_by
            LEFT JOIN users ua ON ua.id = so.id_assigned_user
            WHERE 1 = 1
        `;

        const params = [];

        if (search) {
            const searchTerm = `%${search}%`;
            query += `
                AND (
                    so.order_number LIKE ?
                    OR t.ticket_number LIKE ?
                    OR p.company LIKE ?
                    OR so.service_type LIKE ?
                    OR so.description LIKE ?
                )
            `;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (status) {
            query += " AND so.status = ?";
            params.push(status);
        }

        if (priority) {
            query += " AND so.priority = ?";
            params.push(priority);
        }

        if (id_ticket) {
            query += " AND so.id_ticket = ?";
            params.push(Number(id_ticket));
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
                t.ticket_number,
                t.subject AS ticket_subject,
                p.company AS cliente,
                uc.username AS created_by,
                ua.username AS assigned_user
            FROM service_orders so
            LEFT JOIN tickets t ON t.id_ticket = so.id_ticket
            LEFT JOIN prospects p ON p.id_prospect = so.id_prospect AND COALESCE(p.is_client, 0) = 1
            LEFT JOIN users uc ON uc.id = so.id_created_by
            LEFT JOIN users ua ON ua.id = so.id_assigned_user
            WHERE so.id_service_order = ?
            LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        res.json({ success: true, data: rows[0] });
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
            id_ticket = null,
            id_prospect,
            id_created_by,
            id_assigned_user,
            service_type,
            description,
            priority = "medio",
            status = "pendiente",
            start_date = null,
            estimated_delivery = null,
        } = req.body;

        if (!id_prospect || !service_type) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Cliente y tipo de servicio son obligatorios" });
        }

        const [clientRows] = await connection.query(
            `SELECT id_prospect
             FROM prospects
             WHERE id_prospect = ?
               AND COALESCE(is_client, 0) = 1
             LIMIT 1`,
            [Number(id_prospect)]
        );

        if (!clientRows.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "El cliente seleccionado no es valido" });
        }

        const safeTicketId = id_ticket ? Number(id_ticket) : null;
        if (safeTicketId) {
            const [ticketRows] = await connection.query(
                `SELECT id_ticket, id_prospect
                 FROM tickets
                 WHERE id_ticket = ?
                 LIMIT 1`,
                [safeTicketId]
            );

            if (!ticketRows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: "Ticket no encontrado" });
            }

            if (Number(ticketRows[0].id_prospect) !== Number(id_prospect)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: "El ticket no pertenece al cliente seleccionado" });
            }
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
                  id_ticket,
                  id_prospect,
                  id_created_by,
                  id_assigned_user,
                  service_type,
                  description,
                  priority,
                  status,
                  start_date,
                  estimated_delivery
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                safeTicketId,
                Number(id_prospect),
                Number(id_created_by || req.auth?.sub || 1),
                id_assigned_user ? Number(id_assigned_user) : null,
                String(service_type).trim(),
                description || null,
                String(priority).toLowerCase(),
                String(status).toLowerCase(),
                start_date || null,
                estimated_delivery || null,
            ]
        );

        if (safeTicketId) {
            await refreshTicketHasServiceOrder(connection, safeTicketId);

            await connection.query(
                `INSERT INTO ticket_history
                    (id_ticket, id_user, field_changed, old_value, new_value, description)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    safeTicketId,
                    Number(id_created_by || req.auth?.sub || 1),
                    "service_order",
                    null,
                    String(result.insertId),
                    `Se creo la orden ${orderNumber}`,
                ]
            );
        }

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

exports.createServiceOrderFromTicket = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const ticketId = Number(req.params.ticketId);
        const createdBy = Number(req.auth?.sub || 1);
        const {
            service_type,
            id_assigned_user = null,
            description = null,
            priority = "medio",
            status = "pendiente",
            start_date = null,
            estimated_delivery = null,
        } = req.body || {};

        if (!ticketId) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Ticket invalido" });
        }

        const [ticketRows] = await connection.query(
            `SELECT id_ticket, id_prospect, subject, description, priority
             FROM tickets
             WHERE id_ticket = ?
             LIMIT 1`,
            [ticketId]
        );

        if (!ticketRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Ticket no encontrado" });
        }

        const ticket = ticketRows[0];

        const [[nextRow]] = await connection.query(
            `SELECT COALESCE(MAX(id_service_order), 0) + 1 AS nextId
             FROM service_orders
             FOR UPDATE`
        );

        const orderNumber = `SO-${String(nextRow.nextId).padStart(5, "0")}`;
        const serviceTypeValue = String(service_type || ticket.subject || "Soporte").trim();
        const descriptionValue = description || ticket.description || null;

        const [result] = await connection.query(
            `INSERT INTO service_orders
                (
                  order_number,
                  id_ticket,
                  id_prospect,
                  id_created_by,
                  id_assigned_user,
                  service_type,
                  description,
                  priority,
                  status,
                  start_date,
                  estimated_delivery
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                ticketId,
                Number(ticket.id_prospect),
                createdBy,
                id_assigned_user ? Number(id_assigned_user) : null,
                serviceTypeValue,
                descriptionValue,
                String(priority || ticket.priority || "medio").toLowerCase(),
                String(status || "pendiente").toLowerCase(),
                start_date || null,
                estimated_delivery || null,
            ]
        );

        await refreshTicketHasServiceOrder(connection, ticketId);

        await connection.query(
            `INSERT INTO ticket_history
                (id_ticket, id_user, field_changed, old_value, new_value, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ticketId, createdBy, "service_order", null, String(result.insertId), `Se creo la orden ${orderNumber}`]
        );

        await connection.commit();
        res.status(201).json({
            success: true,
            id_service_order: result.insertId,
            order_number: orderNumber,
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error creando orden desde ticket:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateServiceOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const id = Number(req.params.id);
        const {
            id_ticket = null,
            id_prospect,
            id_assigned_user,
            service_type,
            description,
            priority,
            status,
            start_date,
            estimated_delivery,
        } = req.body;

        if (!id_prospect || !service_type || !priority || !status) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const [orderRows] = await connection.query(
            `SELECT id_service_order, id_ticket
             FROM service_orders
             WHERE id_service_order = ?
             LIMIT 1`,
            [id]
        );

        if (!orderRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        const previousTicketId = Number(orderRows[0].id_ticket || 0) || null;

        const [clientRows] = await connection.query(
            `SELECT id_prospect
             FROM prospects
             WHERE id_prospect = ?
               AND COALESCE(is_client, 0) = 1
             LIMIT 1`,
            [Number(id_prospect)]
        );

        if (!clientRows.length) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "El cliente seleccionado no es valido" });
        }

        const safeTicketId = id_ticket ? Number(id_ticket) : null;

        if (safeTicketId) {
            const [ticketRows] = await connection.query(
                `SELECT id_ticket, id_prospect
                 FROM tickets
                 WHERE id_ticket = ?
                 LIMIT 1`,
                [safeTicketId]
            );

            if (!ticketRows.length) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: "Ticket no encontrado" });
            }

            if (Number(ticketRows[0].id_prospect) !== Number(id_prospect)) {
                await connection.rollback();
                return res.status(400).json({ success: false, message: "El ticket no pertenece al cliente seleccionado" });
            }
        }

        const [result] = await connection.query(
            `UPDATE service_orders
             SET
                id_ticket = ?,
                id_prospect = ?,
                id_assigned_user = ?,
                service_type = ?,
                description = ?,
                priority = ?,
                status = ?,
                start_date = ?,
                estimated_delivery = ?
             WHERE id_service_order = ?`,
            [
                safeTicketId,
                Number(id_prospect),
                id_assigned_user ? Number(id_assigned_user) : null,
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
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        if (previousTicketId && previousTicketId !== safeTicketId) {
            await refreshTicketHasServiceOrder(connection, previousTicketId);
        }

        if (safeTicketId) {
            await refreshTicketHasServiceOrder(connection, safeTicketId);
        }

        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error("Error actualizando orden de servicio:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.deleteServiceOrder = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const id = Number(req.params.id);
        await connection.beginTransaction();

        const [orderRows] = await connection.query(
            `SELECT id_ticket
             FROM service_orders
             WHERE id_service_order = ?
             LIMIT 1`,
            [id]
        );

        if (!orderRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        const previousTicketId = Number(orderRows[0].id_ticket || 0) || null;

        await connection.query(
            "DELETE FROM service_orders WHERE id_service_order = ?",
            [id]
        );

        if (previousTicketId) {
            await refreshTicketHasServiceOrder(connection, previousTicketId);
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
