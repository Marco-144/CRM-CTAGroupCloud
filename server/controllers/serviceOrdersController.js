const db = require("../config/db");
const {
    buildUploadedPaths,
    mergeStoredAttachments,
} = require("../utils/attachments");

function normalizeComparableValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    return String(value);
}

async function loadServiceOrderResponseAttachments(connection, responseIds) {
    if (!Array.isArray(responseIds) || !responseIds.length) {
        return new Map();
    }

    const [rows] = await connection.query(
        `SELECT
            id_service_order_response,
            file_path,
            original_name,
            mime_type,
            created_at
         FROM service_order_response_attachments
         WHERE id_service_order_response IN (?)
         ORDER BY id_service_order_response_attachment ASC`,
        [responseIds]
    );

    const grouped = new Map();

    for (const row of rows) {
        const key = Number(row.id_service_order_response);
        const current = grouped.get(key) || [];
        current.push({
            file_path: row.file_path,
            original_name: row.original_name,
            mime_type: row.mime_type,
            created_at: row.created_at,
        });
        grouped.set(key, current);
    }

    return grouped;
}

async function insertServiceOrderResponseAttachments(connection, responseId, files, uploadedFiles) {
    const attachments = mergeStoredAttachments(files);
    if (!attachments.length) {
        return;
    }

    const uploadsByPath = new Map(
        (Array.isArray(uploadedFiles) ? uploadedFiles : []).map((file) => [
            `server/uploads/service_order_attachments/${file.filename}`,
            file,
        ])
    );

    for (const filePath of attachments) {
        const fileInfo = uploadsByPath.get(filePath);

        await connection.query(
            `INSERT INTO service_order_response_attachments
                (id_service_order_response, file_path, original_name, mime_type)
             VALUES (?, ?, ?, ?)`,
            [
                responseId,
                filePath,
                fileInfo?.originalname ? String(fileInfo.originalname).slice(0, 255) : null,
                fileInfo?.mimetype ? String(fileInfo.mimetype).slice(0, 150) : null,
            ]
        );
    }
}

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
                COALESCE(uc.name, uc.username) AS created_by,
                COALESCE(ua.name, ua.username) AS assigned_user
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
                COALESCE(uc.name, uc.username) AS created_by,
                rc.name AS created_by_role,
                dc.name AS created_by_department,
                COALESCE(ua.name, ua.username) AS assigned_user,
                ra.name AS assigned_user_role,
                da.name AS assigned_user_department
            FROM service_orders so
            LEFT JOIN tickets t ON t.id_ticket = so.id_ticket
            LEFT JOIN prospects p ON p.id_prospect = so.id_prospect AND COALESCE(p.is_client, 0) = 1
            LEFT JOIN users uc ON uc.id = so.id_created_by
            LEFT JOIN roles rc ON rc.id_role = uc.id_role
            LEFT JOIN departments dc ON dc.id_department = uc.id_department
            LEFT JOIN users ua ON ua.id = so.id_assigned_user
            LEFT JOIN roles ra ON ra.id_role = ua.id_role
            LEFT JOIN departments da ON da.id_department = ua.id_department
            WHERE so.id_service_order = ?
            LIMIT 1`,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        const [responses] = await db.query(
            `SELECT
                sor.id_service_order_response,
                sor.id_service_order,
                sor.id_user,
                COALESCE(u.name, u.username) AS name,
                r.name AS role,
                d.name AS department,
                sor.message,
                sor.attachment,
                sor.created_at
            FROM service_order_responses sor
            LEFT JOIN users u ON u.id = sor.id_user
            LEFT JOIN roles r ON r.id_role = u.id_role
            LEFT JOIN departments d ON d.id_department = u.id_department
            WHERE sor.id_service_order = ?
            ORDER BY sor.id_service_order_response ASC`,
            [id]
        );

        const responseAttachments = await loadServiceOrderResponseAttachments(
            db,
            responses.map((response) => Number(response.id_service_order_response))
        );

        const [history] = await db.query(
            `SELECT
                soh.id_service_order_history,
                soh.id_service_order,
                soh.id_user,
                COALESCE(u.name, u.username) AS name,
                r.name AS role,
                d.name AS department,
                soh.field_changed,
                soh.old_value,
                soh.new_value,
                soh.description,
                soh.created_at
            FROM service_order_history soh
            LEFT JOIN users u ON u.id = soh.id_user
            LEFT JOIN roles r ON r.id_role = u.id_role
            LEFT JOIN departments d ON d.id_department = u.id_department
            WHERE soh.id_service_order = ?
            ORDER BY soh.id_service_order_history DESC`,
            [id]
        );

        res.json({
            success: true,
            data: {
                ...rows[0],
                responses: responses.map((response) => ({
                    ...response,
                    attachments: mergeStoredAttachments(
                        response.attachment,
                        (responseAttachments.get(Number(response.id_service_order_response)) || []).map((item) => item.file_path)
                    ),
                })),
                history,
            },
        });
    } catch (error) {
        console.error("Error obteniendo orden de servicio:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createServiceOrderResponse = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const orderId = Number(req.params.id);
        const message = String(req.body?.message || "").trim();
        const userId = Number(req.auth?.sub || req.body?.id_user || 1);
        const uploadedFiles = Array.isArray(req.files)
            ? req.files
            : (req.files && typeof req.files === "object" ? Object.values(req.files).flat() : []);
        const attachments = mergeStoredAttachments(
            buildUploadedPaths(req, "service_order_attachments"),
            req.body?.attachments,
            req.body?.attachment
        );

        if (!orderId || (!message && !attachments.length)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "La orden y un mensaje o adjunto son obligatorios" });
        }

        const [orderRows] = await connection.query(
            `SELECT id_service_order
             FROM service_orders
             WHERE id_service_order = ?
             LIMIT 1`,
            [orderId]
        );

        if (!orderRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Orden no encontrada" });
        }

        const [responseResult] = await connection.query(
            `INSERT INTO service_order_responses
                (id_service_order, id_user, message, attachment)
             VALUES (?, ?, ?, ?)`,
            [orderId, userId, message || null, attachments[0] || null]
        );

        await insertServiceOrderResponseAttachments(connection, responseResult.insertId, attachments, uploadedFiles);

        await connection.query(
            `INSERT INTO service_order_history
                (id_service_order, id_user, field_changed, old_value, new_value, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [orderId, userId, "response", null, "message", "Se agrego una respuesta a la orden de servicio"]
        );

        await connection.commit();
        res.status(201).json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error("Error agregando respuesta a la orden de servicio:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
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
        const uploadedFiles = Array.isArray(req.files)
            ? req.files
            : (req.files && typeof req.files === "object" ? Object.values(req.files).flat() : []);
        const attachmentPaths = mergeStoredAttachments(
            buildUploadedPaths(req, "service_order_attachments"),
            req.body?.attachments,
            req.body?.attachment
        );

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

        const initialMessage = String(description || "").trim();
        if (initialMessage || attachmentPaths.length) {
            const [responseResult] = await connection.query(
                `INSERT INTO service_order_responses
                    (id_service_order, id_user, message, attachment)
                 VALUES (?, ?, ?, ?)`,
                [
                    result.insertId,
                    Number(id_created_by || req.auth?.sub || 1),
                    initialMessage || "Adjuntos iniciales de la orden de servicio",
                    attachmentPaths[0] || null,
                ]
            );

            await insertServiceOrderResponseAttachments(connection, responseResult.insertId, attachmentPaths, uploadedFiles);
        }

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

        if (descriptionValue) {
            await connection.query(
                `INSERT INTO service_order_responses
                    (id_service_order, id_user, message, attachment)
                 VALUES (?, ?, ?, ?)`,
                [result.insertId, createdBy, descriptionValue, null]
            );
        }

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
                    , id_prospect
                    , id_assigned_user
                    , service_type
                    , description
                    , priority
                    , status
                    , start_date
                    , estimated_delivery
                    , order_number
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
        const existingOrder = orderRows[0];

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

        const auditUserId = Number(req.body?.id_user || req.auth?.sub || 1);
        const changes = [
            ["id_ticket", existingOrder.id_ticket, safeTicketId],
            ["id_prospect", existingOrder.id_prospect, id_prospect],
            ["id_assigned_user", existingOrder.id_assigned_user, id_assigned_user || null],
            ["service_type", existingOrder.service_type, service_type],
            ["description", existingOrder.description, description || null],
            ["priority", existingOrder.priority, String(priority).toLowerCase()],
            ["status", existingOrder.status, String(status).toLowerCase()],
            ["start_date", existingOrder.start_date, start_date || null],
            ["estimated_delivery", existingOrder.estimated_delivery, estimated_delivery || null],
        ];

        for (const [field, oldValue, newValue] of changes) {
            const oldNormalized = normalizeComparableValue(oldValue);
            const newNormalized = normalizeComparableValue(newValue);

            if (oldNormalized === newNormalized) {
                continue;
            }

            await connection.query(
                `INSERT INTO service_order_history
                    (id_service_order, id_user, field_changed, old_value, new_value, description)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    auditUserId,
                    field,
                    oldNormalized || null,
                    newNormalized || null,
                    `Cambio en ${field}`,
                ]
            );
        }

        if (previousTicketId && previousTicketId !== safeTicketId) {
            await connection.query(
                `INSERT INTO ticket_history
                    (id_ticket, id_user, field_changed, old_value, new_value, description)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    previousTicketId,
                    auditUserId,
                    "service_order",
                    String(id),
                    null,
                    `Se desvinculo la orden ${existingOrder.order_number}`,
                ]
            );
        }

        if (safeTicketId && previousTicketId !== safeTicketId) {
            await connection.query(
                `INSERT INTO ticket_history
                    (id_ticket, id_user, field_changed, old_value, new_value, description)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    safeTicketId,
                    auditUserId,
                    "service_order",
                    null,
                    String(id),
                    `Se vinculo la orden ${existingOrder.order_number}`,
                ]
            );
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
            `DELETE sora
             FROM service_order_response_attachments sora
             INNER JOIN service_order_responses sor ON sor.id_service_order_response = sora.id_service_order_response
             WHERE sor.id_service_order = ?`,
            [id]
        );
        await connection.query(
            "DELETE FROM service_order_responses WHERE id_service_order = ?",
            [id]
        );
        await connection.query(
            "DELETE FROM service_order_history WHERE id_service_order = ?",
            [id]
        );
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
