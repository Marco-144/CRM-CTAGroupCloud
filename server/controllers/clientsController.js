const db = require("../config/db");

exports.getClients = async (req, res) => {
    try {
        const [rows] = await db.query(`
        SELECT
        p.id_prospect AS id_client,
        p.company,
        p.name,
        p.email,
        p.phone,
        cp.rfc,
        cp.fiscal_name,
        cp.billing_email,
        cp.tax_certificate_pdf,
        cp.created_at
        FROM prospects p
        LEFT JOIN client_profiles cp
        ON cp.id_prospect = p.id_prospect
        WHERE p.is_client = 1
        ORDER BY p.company
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.getClient = async (req, res) => {
    try {
        const { id } = req.params;

        const [client] = await db.query(
            `
            SELECT
            p.*,
            cp.*
            FROM prospects p
            LEFT JOIN client_profiles cp
            ON cp.id_prospect = p.id_prospect
            WHERE p.id_prospect = ?
            `,
            [id],
        );

        res.json({ success: true, data: client[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.deleteClient = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const safeId = Number(req.params.id);
        if (!safeId) {
            res.status(400).json({ success: false, message: "Cliente invalido" });
            return;
        }

        await connection.beginTransaction();

        const [clientRows] = await connection.query(
            `SELECT id_prospect FROM prospects WHERE id_prospect = ? LIMIT 1`,
            [safeId],
        );

        if (!clientRows.length) {
            await connection.rollback();
            res.status(404).json({ success: false, message: "Cliente no encontrado" });
            return;
        }

        await connection.query(
            `DELETE FROM client_profiles WHERE id_prospect = ?`,
            [safeId],
        );

        await connection.query(
            `UPDATE prospects SET is_client = 0 WHERE id_prospect = ?`,
            [safeId],
        );

        await connection.commit();
        res.json({ success: true, message: "Cliente eliminado" });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message || "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateClientProfile = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            rfc,
            fiscal_name,
            fiscal_regime,
            billing_email,
            address,
            city,
            state,
            postal_code,
            country,
        } = req.body;

        const safeId = Number(id);
        const docPath = req.file ? `server/uploads/fiscal_docs/${req.file.filename}` : null;

        let currentDocPath = null;
        const [existing] = await db.query(
            `SELECT tax_certificate_pdf
             FROM client_profiles
             WHERE id_prospect = ?
             LIMIT 1`,
            [safeId]
        );

        if (existing.length) {
            currentDocPath = existing[0].tax_certificate_pdf || null;
        }

        await db.query(
            `
            INSERT INTO client_profiles
            (
            id_prospect,
            rfc,
            fiscal_name,
            fiscal_regime,
            billing_email,
            address,
            city,
            state,
            postal_code,
            country,
            tax_certificate_pdf
            )
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
            rfc = VALUES(rfc),
            fiscal_name = VALUES(fiscal_name),
            fiscal_regime = VALUES(fiscal_regime),
            billing_email = VALUES(billing_email),
            address = VALUES(address),
            city = VALUES(city),
            state = VALUES(state),
            postal_code = VALUES(postal_code),
            country = VALUES(country),
            tax_certificate_pdf = VALUES(tax_certificate_pdf)
            `,
            [
                safeId,
                rfc,
                fiscal_name,
                fiscal_regime,
                billing_email,
                address,
                city,
                state,
                postal_code,
                country || "Mexico",
                docPath || currentDocPath,
            ],
        );

        res.json({ success: true, tax_certificate_pdf: docPath || currentDocPath });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message || "Error del servidor" });
    }
};
