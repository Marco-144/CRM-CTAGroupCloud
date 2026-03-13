const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_dev_secret";
const JWT_EXPIRES = process.env.JWT_EXPIRES || "2h";

exports.login = async (req, res) => {
    try {
        const { user, password } = req.body;

        if (!user || !password) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const [rows] = await db.query(
            `SELECT
                 id,
                 username,
                 name,
                 password_hash,
                 id_department,
                 id_role,
                 token_version
             FROM users
             WHERE username = ?
             LIMIT 1`,
            [user],
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: "Credenciales invalidas" });
        }

        const dbUser = rows[0];
        const valid = await bcrypt.compare(password, dbUser.password_hash || "");

        if (!valid) {
            return res.status(401).json({ success: false, message: "Credenciales invalidas" });
        }

        const token = jwt.sign(
            {
                sub: dbUser.id,
                username: dbUser.username,
                name: dbUser.name,
                id_department: dbUser.id_department,
                id_role: dbUser.id_role,
                token_version: dbUser.token_version || 0,
            },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES },
        );

        res.json({
            success: true,
            token,
            user: {
                id: dbUser.id,
                username: dbUser.username,
                name: dbUser.name,
                id_department: dbUser.id_department,
                id_role: dbUser.id_role,
            },
        });
    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.me = async (req, res) => {
    try {
        const userId = Number(req.auth.sub);

        const [rows] = await db.query(
            `SELECT
                 u.id,
                 u.username,
                  u.name,
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
            [userId],
        );

        if (!rows.length) {
            return res.status(401).json({ success: false, message: "Sesion invalida" });
        }

        const currentUser = rows[0];

        if (Number(currentUser.token_version || 0) !== Number(req.auth.token_version || 0)) {
            return res.status(401).json({ success: false, message: "Sesion expirada" });
        }

        res.json({ success: true, user: currentUser });
    } catch (err) {
        console.error("Error en validacion de sesion:", err);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};
