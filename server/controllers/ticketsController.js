const db = require("../config/db");
const {
    buildUploadedPaths,
    mergeStoredAttachments,
} = require("../utils/attachments");

async function loadTicketResponseAttachments(connection, responseIds) {
    if (!Array.isArray(responseIds) || !responseIds.length) {
        return new Map();
    }

    const [rows] = await connection.query(
        `SELECT
            id_ticket_response,
            file_path,
            original_name,
            mime_type,
            created_at
         FROM ticket_response_attachments
         WHERE id_ticket_response IN (?)
         ORDER BY id_ticket_response_attachment ASC`,
        [responseIds]
    );

    const grouped = new Map();

    for (const row of rows) {
        const key = Number(row.id_ticket_response);
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

async function insertTicketResponseAttachments(connection, responseId, files, uploadedFiles) {
    const attachments = mergeStoredAttachments(files);
    if (!attachments.length) {
        return;
    }

    const uploadsByPath = new Map(
        (Array.isArray(uploadedFiles) ? uploadedFiles : []).map((file) => [
            `server/uploads/ticket_attachments/${file.filename}`,
            file,
        ])
    );

    for (const filePath of attachments) {
        const fileInfo = uploadsByPath.get(filePath);

        await connection.query(
            `INSERT INTO ticket_response_attachments
                (id_ticket_response, file_path, original_name, mime_type)
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

exports.getTickets = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            priority = "",
            ticket_type = "",
            has_service_order = "",
        } = req.query;

        const isAdmin = String(req.auth?.department || "").toLowerCase() === "administrador";
        const authUserId = Number(req.auth?.sub || 0);

        let query = `
            SELECT
                t.id_ticket,
                t.ticket_number,
                t.id_prospect,
                p.company AS cliente,
                t.subject,
                t.description,
                t.id_department,
                d.name AS department,
                t.id_created_by,
                COALESCE(uc.name, uc.username) AS created_by,
                t.id_assigned_user,
                COALESCE(ua.name, ua.username) AS assigned_user,
                t.priority,
                t.status,
                t.ticket_type,
                t.due_date,
                t.has_service_order,
                (
                    SELECT COUNT(*)
                    FROM service_orders so
                    WHERE so.id_ticket = t.id_ticket
                ) AS total_service_orders,
                t.created_at,
                t.updated_at
            FROM tickets t
            LEFT JOIN prospects p ON p.id_prospect = t.id_prospect AND COALESCE(p.is_client, 0) = 1
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
                )
            `;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
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

        if (has_service_order === "0" || has_service_order === "1") {
            query += " AND t.has_service_order = ?";
            params.push(Number(has_service_order));
        }

        if (!isAdmin && authUserId) {
            query += " AND t.id_assigned_user = ?";
            params.push(authUserId);
        }

        query += " ORDER BY t.id_ticket DESC";

        const [rows] = await db.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error listando tickets:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getTicket = async (req, res) => {
    try {
        const id = Number(req.params.id);

        const [rows] = await db.query(
            `SELECT
                t.id_ticket,
                t.ticket_number,
                t.id_prospect,
                p.company AS cliente,
                t.subject,
                t.description,
                t.id_department,
                d.name AS department,
                t.id_created_by,
                COALESCE(uc.name, uc.username) AS created_by,
                rc.name AS created_by_role,
                dc.name AS created_by_department,
                t.id_assigned_user,
                COALESCE(ua.name, ua.username) AS assigned_user,
                ra.name AS assigned_user_role,
                da.name AS assigned_user_department,
                t.priority,
                t.status,
                t.ticket_type,
                t.due_date,
                t.has_service_order,
                t.created_at,
                t.updated_at
            FROM tickets t
            LEFT JOIN prospects p ON p.id_prospect = t.id_prospect AND COALESCE(p.is_client, 0) = 1
            LEFT JOIN departments d ON d.id_department = t.id_department
            LEFT JOIN users uc ON uc.id = t.id_created_by
            LEFT JOIN roles rc ON rc.id_role = uc.id_role
            LEFT JOIN departments dc ON dc.id_department = uc.id_department
            LEFT JOIN users ua ON ua.id = t.id_assigned_user
            LEFT JOIN roles ra ON ra.id_role = ua.id_role
            LEFT JOIN departments da ON da.id_department = ua.id_department
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
                COALESCE(u.name, u.username) AS name,
                r.name AS role,
                d.name AS department,
                tr.message,
                tr.attachment,
                tr.created_at
            FROM ticket_responses tr
            LEFT JOIN users u ON u.id = tr.id_user
            LEFT JOIN roles r ON r.id_role = u.id_role
            LEFT JOIN departments d ON d.id_department = u.id_department
            WHERE tr.id_ticket = ?
            ORDER BY tr.id_ticket_responses ASC`,
            [id]
        );

        const responseAttachments = await loadTicketResponseAttachments(
            db,
            responses.map((response) => Number(response.id_ticket_responses))
        );

        const [history] = await db.query(
            `SELECT
                th.id_ticket_history,
                th.id_ticket,
                th.id_user,
                COALESCE(u.name, u.username) AS name,
                r.name AS role,
                d.name AS department,
                th.field_changed,
                th.old_value,
                th.new_value,
                th.description,
                th.created_at
            FROM ticket_history th
            LEFT JOIN users u ON u.id = th.id_user
            LEFT JOIN roles r ON r.id_role = u.id_role
            LEFT JOIN departments d ON d.id_department = u.id_department
            WHERE th.id_ticket = ?
            ORDER BY th.id_ticket_history DESC`,
            [id]
        );

        const [serviceOrders] = await db.query(
            `SELECT
                so.id_service_order,
                so.order_number,
                so.service_type,
                so.priority,
                so.status,
                so.start_date,
                so.estimated_delivery,
                so.created_at
            FROM service_orders so
            WHERE so.id_ticket = ?
            ORDER BY so.id_service_order DESC`,
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
                        (responseAttachments.get(Number(response.id_ticket_responses)) || []).map((item) => item.file_path)
                    ),
                })),
                history,
                service_orders: serviceOrders,
            },
        });
    } catch (error) {
        console.error("Error obteniendo ticket:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createTicketResponse = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const ticketId = Number(req.params.id);
        const message = String(req.body?.message || "").trim();
        const uploadedFiles = Array.isArray(req.files)
            ? req.files
            : (req.files && typeof req.files === "object" ? Object.values(req.files).flat() : []);
        const attachments = mergeStoredAttachments(
            buildUploadedPaths(req, "ticket_attachments"),
            req.body?.attachments,
            req.body?.attachment
        );
        const userId = Number(req.auth?.sub || req.body?.id_user || 1);

        if (!ticketId || (!message && !attachments.length)) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "El ticket y un mensaje o adjunto son obligatorios" });
        }

        const [ticketRows] = await connection.query(
            `SELECT id_ticket
             FROM tickets
             WHERE id_ticket = ?
             LIMIT 1`,
            [ticketId]
        );

        if (!ticketRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Ticket no encontrado" });
        }

        const [result] = await connection.query(
            `INSERT INTO ticket_responses
                (id_ticket, id_user, message, attachment)
             VALUES (?, ?, ?, ?)`,
            [ticketId, userId, message || null, attachments[0] || null]
        );

        await insertTicketResponseAttachments(connection, result.insertId, attachments, uploadedFiles);

        await connection.query(
            `INSERT INTO ticket_history
                (id_ticket, id_user, field_changed, old_value, new_value, description)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ticketId, userId, "response", null, "message", "Se agrego una respuesta al ticket"]
        );

        await connection.commit();
        res.status(201).json({ success: true });
    } catch (error) {
        await connection.rollback();
        console.error("Error agregando respuesta al ticket:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.createTicket = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const {
            id_prospect,
            subject,
            description,
            id_department,
            id_created_by,
            id_assigned_user,
            priority = "medio",
            status = "abierto",
            ticket_type = "soporte",
            due_date = null,
        } = req.body;

        const uploadedFiles = Array.isArray(req.files)
            ? req.files
            : (req.files && typeof req.files === "object" ? Object.values(req.files).flat() : []);
        const attachmentPaths = mergeStoredAttachments(
            buildUploadedPaths(req, "ticket_attachments"),
            req.body?.attachments,
            req.body?.attachment
        );

        if (!id_prospect || !subject || !id_department) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: "Cliente, asunto y departamento son obligatorios" });
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
                  id_prospect,
                  subject,
                  description,
                  id_department,
                  id_created_by,
                  id_assigned_user,
                  priority,
                  status,
                  ticket_type,
                  due_date,
                  has_service_order
                )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [
                ticketNumber,
                Number(id_prospect),
                String(subject).trim(),
                description || null,
                Number(id_department),
                Number(id_created_by || req.auth?.sub || 1),
                id_assigned_user ? Number(id_assigned_user) : null,
                String(priority).toLowerCase(),
                String(status).toLowerCase(),
                String(ticket_type).toLowerCase(),
                due_date || null,
            ]
        );

        const initialMessage = String(description || "").trim();
        if (initialMessage || attachmentPaths.length) {
            const [responseResult] = await connection.query(
                `INSERT INTO ticket_responses
                    (id_ticket, id_user, message, attachment)
                 VALUES (?, ?, ?, ?)`,
                [
                    result.insertId,
                    Number(id_created_by || req.auth?.sub || 1),
                    initialMessage || "Adjuntos iniciales del ticket",
                    attachmentPaths[0] || null,
                ]
            );

            await insertTicketResponseAttachments(connection, responseResult.insertId, attachmentPaths, uploadedFiles);
        }

        await connection.commit();
        res.status(201).json({
            success: true,
            id_ticket: result.insertId,
            ticket_number: ticketNumber,
        });
    } catch (error) {
        await connection.rollback();
        console.error("Error creando ticket:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateTicket = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const id = Number(req.params.id);
        const {
            id_prospect,
            subject,
            description,
            id_department,
            id_assigned_user,
            priority,
            status,
            ticket_type,
            due_date,
            id_user,
        } = req.body;

        const [existingRows] = await connection.query(
            `SELECT
                id_prospect,
                subject,
                description,
                id_department,
                id_assigned_user,
                priority,
                status,
                ticket_type,
                due_date,
                has_service_order
             FROM tickets
             WHERE id_ticket = ?
             LIMIT 1`,
            [id]
        );

        if (!existingRows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Ticket no encontrado" });
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

        const existing = existingRows[0];
        const cleanTicketType = String(ticket_type || existing.ticket_type).toLowerCase();

        await connection.query(
            `UPDATE tickets
             SET
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
                Number(id_prospect),
                String(subject).trim(),
                description || null,
                Number(id_department),
                id_assigned_user ? Number(id_assigned_user) : null,
                String(priority).toLowerCase(),
                String(status).toLowerCase(),
                cleanTicketType,
                due_date || null,
                id,
            ]
        );

        const [[orderCountRow]] = await connection.query(
            `SELECT COUNT(*) AS total
             FROM service_orders
             WHERE id_ticket = ?`,
            [id]
        );

        const hasServiceOrder = Number(orderCountRow?.total || 0) > 0 ? 1 : 0;

        await connection.query(
            `UPDATE tickets
             SET has_service_order = ?
             WHERE id_ticket = ?`,
            [hasServiceOrder, id]
        );

        const auditUserId = Number(id_user || req.auth?.sub || 1);
        const changes = [
            ["id_prospect", existing.id_prospect, id_prospect],
            ["subject", existing.subject, subject],
            ["description", existing.description, description],
            ["id_department", existing.id_department, id_department],
            ["id_assigned_user", existing.id_assigned_user, id_assigned_user || null],
            ["priority", existing.priority, String(priority).toLowerCase()],
            ["status", existing.status, String(status).toLowerCase()],
            ["ticket_type", existing.ticket_type, cleanTicketType],
            ["due_date", existing.due_date, due_date || null],
            ["has_service_order", existing.has_service_order, hasServiceOrder],
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
                    `Cambio en ${field}`,
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
};

exports.deleteTicket = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const id = Number(req.params.id);
        await connection.beginTransaction();

        await connection.query(
            `DELETE tra
             FROM ticket_response_attachments tra
             INNER JOIN ticket_responses tr ON tr.id_ticket_responses = tra.id_ticket_response
             WHERE tr.id_ticket = ?`,
            [id]
        );
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
};
