const db = require("../config/db");

exports.getTickets = async (req, res) => {
    try {
        const {
            search = "",
            status = "",
            priority = "",
            ticket_type = "",
            id_service_order = "",
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
};

exports.getTicket = async (req, res) => {
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
};

exports.createTicket = async (req, res) => {
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
            due_date = null,
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
                due_date || null,
            ]
        );

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
            id_user,
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
                id,
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
            ["due_date", existing.due_date, due_date || null],
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
