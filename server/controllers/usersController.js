const db = require("../config/db");
const bcrypt = require("bcryptjs");

exports.getUsers = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
         u.id,
         u.username,
         u.name,
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
};

exports.createUser = async (req, res) => {
    try {
        const { username, name, email, password, id_department, id_role } = req.body;

        if (!username || !name || !email || !password || !id_department || !id_role) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const password_hash = await bcrypt.hash(password, 12);

        const [result] = await db.query(
            `INSERT INTO users (username, name, email, password_hash, id_department, id_role)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [
                username.trim(),
                name.trim(),
                email.trim(),
                password_hash,
                Number(id_department),
                Number(id_role)
            ]
        );

        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        console.error("Error al crear usuario:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, name, email, password, id_department, id_role } = req.body;

        if (!username || !name || !email || !id_department || !id_role) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const updates = [
            "username = ?",
            "name = ?",
            "email = ?",
            "id_department = ?",
            "id_role = ?"
        ];
        const params = [
            username.trim(),
            name.trim(),
            email.trim(),
            Number(id_department),
            Number(id_role)
        ];

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
};

exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const [result] = await db.query("DELETE FROM users WHERE id = ?", [Number(id)]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Usuario no encontrado" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};
