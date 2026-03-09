const db = require("../config/db");

exports.getProspects = async (req, res) => {
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
};

exports.getProspect = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT id_prospect, name, company, phone, email, priority, status
       FROM prospects
       WHERE id_prospect = ?
       LIMIT 1`,
            [Number(id)]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Prospecto no encontrado" });
        }

        res.json({ success: true, data: rows[0] });
    } catch (error) {
        console.error("Error al obtener prospecto:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createProspect = async (req, res) => {
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
};

exports.updateProspect = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, company, phone, email, priority, status } = req.body;

        if (!name || !company || !priority || !status) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const [result] = await db.query(
            `UPDATE prospects
       SET name = ?, company = ?, phone = ?, email = ?, priority = ?, status = ?
       WHERE id_prospect = ?`,
            [name, company, phone || null, email || null, priority, status, Number(id)]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Prospecto no encontrado" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error al actualizar prospecto:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.deleteProspect = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query("DELETE FROM prospects WHERE id_prospect = ?", [Number(id)]);

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Prospecto no encontrado" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error al eliminar prospecto:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};
