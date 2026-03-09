const db = require("../config/db");

exports.getDepartments = async (req, res) => {
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
};

exports.getRoles = async (req, res) => {
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
};
