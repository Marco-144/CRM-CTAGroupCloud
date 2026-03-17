const db = require("../config/db");

async function ensureContactsTable(connectionOrDb = db) {
    await connectionOrDb.query(`
        CREATE TABLE IF NOT EXISTS client_contacts (
            id_contact INT AUTO_INCREMENT PRIMARY KEY,
            id_prospect INT NOT NULL,
            name VARCHAR(150) NOT NULL,
            position VARCHAR(120) NULL,
            phone VARCHAR(50) NULL,
            email VARCHAR(180) NULL,
            is_primary TINYINT(1) NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_client_contacts_prospect (id_prospect)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
}

function parseContacts(rawContacts) {
    if (!rawContacts) return [];

    try {
        const parsed = typeof rawContacts === "string"
            ? JSON.parse(rawContacts)
            : rawContacts;

        if (!Array.isArray(parsed)) return [];

        const normalized = parsed
            .map((item) => ({
                name: String(item?.name || "").trim(),
                position: String(item?.position || "").trim(),
                phone: String(item?.phone || "").trim(),
                email: String(item?.email || "").trim(),
                is_primary: Number(item?.is_primary) === 1 ? 1 : 0,
            }))
            .filter((item) => item.name || item.position || item.phone || item.email);

        if (normalized.length && !normalized.some((item) => item.is_primary)) {
            normalized[0].is_primary = 1;
        }

        return normalized;
    } catch (_error) {
        return [];
    }
}

function getDocPath(file) {
    return file ? `server/uploads/fiscal_docs/${file.filename}` : null;
}

async function upsertClientProfile(connection, idProspect, profileData, file) {
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
    } = profileData;

    const docPath = getDocPath(file);

    let currentDocPath = null;
    const [existing] = await connection.query(
        `SELECT tax_certificate_pdf
         FROM client_profiles
         WHERE id_prospect = ?
         LIMIT 1`,
        [idProspect]
    );

    if (existing.length) {
        currentDocPath = existing[0].tax_certificate_pdf || null;
    }

    await connection.query(
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
            idProspect,
            rfc || null,
            fiscal_name || null,
            fiscal_regime || null,
            billing_email || null,
            address || null,
            city || null,
            state || null,
            postal_code || null,
            country || "Mexico",
            docPath || currentDocPath,
        ]
    );
}

async function syncClientContacts(connection, idProspect, contacts) {
    await ensureContactsTable(connection);

    await connection.query(
        `DELETE FROM client_contacts WHERE id_prospect = ?`,
        [idProspect]
    );

    if (!contacts.length) return;

    const values = contacts.map((item) => ([
        idProspect,
        item.name,
        item.position || null,
        item.phone || null,
        item.email || null,
        item.is_primary ? 1 : 0,
    ]));

    await connection.query(
        `
        INSERT INTO client_contacts
        (id_prospect, name, position, phone, email, is_primary)
        VALUES ?
        `,
        [values]
    );
}

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
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getClient = async (req, res) => {
    try {
        const { id } = req.params;
        const safeId = Number(id);

        const [clientRows] = await db.query(
            `
            SELECT
                p.id_prospect,
                p.name,
                p.company,
                p.phone,
                p.email,
                p.priority,
                p.status,
                p.is_client,
                cp.rfc,
                cp.fiscal_name,
                cp.fiscal_regime,
                cp.billing_email,
                cp.address,
                cp.city,
                cp.state,
                cp.postal_code,
                cp.country,
                cp.tax_certificate_pdf
            FROM prospects p
            LEFT JOIN client_profiles cp
                ON cp.id_prospect = p.id_prospect
            WHERE p.id_prospect = ?
            LIMIT 1
            `,
            [safeId]
        );

        if (!clientRows.length || Number(clientRows[0].is_client || 0) !== 1) {
            return res.status(404).json({ success: false, message: "Cliente no encontrado" });
        }

        await ensureContactsTable(db);
        const [contactRows] = await db.query(
            `
            SELECT id_contact, name, position, phone, email, is_primary
            FROM client_contacts
            WHERE id_prospect = ?
            ORDER BY is_primary DESC, id_contact ASC
            `,
            [safeId]
        );

        res.json({ success: true, data: { ...clientRows[0], contacts: contactRows } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createClient = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const {
            name,
            company,
            phone,
            email,
            priority,
            status,
        } = req.body;

        if (!name || !company || !priority || !status) {
            res.status(400).json({ success: false, message: "Datos incompletos" });
            return;
        }

        const contacts = parseContacts(req.body.contacts);

        await connection.beginTransaction();

        const [insertResult] = await connection.query(
            `
            INSERT INTO prospects (name, company, phone, email, priority, status, is_client)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            `,
            [name.trim(), company.trim(), phone || null, email || null, priority, status]
        );

        const idProspect = insertResult.insertId;

        await upsertClientProfile(connection, idProspect, req.body, req.file);
        await syncClientContacts(connection, idProspect, contacts);

        await connection.commit();
        res.status(201).json({ success: true, id_client: idProspect });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message || "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateClient = async (req, res) => {
    const connection = await db.getConnection();

    try {
        const safeId = Number(req.params.id);
        const {
            name,
            company,
            phone,
            email,
            priority,
            status,
        } = req.body;

        if (!safeId || !name || !company || !priority || !status) {
            res.status(400).json({ success: false, message: "Datos incompletos" });
            return;
        }

        const contacts = parseContacts(req.body.contacts);

        await connection.beginTransaction();

        const [existsRows] = await connection.query(
            `SELECT id_prospect FROM prospects WHERE id_prospect = ? AND COALESCE(is_client, 0) = 1 LIMIT 1`,
            [safeId]
        );

        if (!existsRows.length) {
            await connection.rollback();
            res.status(404).json({ success: false, message: "Cliente no encontrado" });
            return;
        }

        await connection.query(
            `
            UPDATE prospects
            SET
                name = ?,
                company = ?,
                phone = ?,
                email = ?,
                priority = ?,
                status = ?,
                is_client = 1
            WHERE id_prospect = ?
            `,
            [name.trim(), company.trim(), phone || null, email || null, priority, status, safeId]
        );

        await upsertClientProfile(connection, safeId, req.body, req.file);
        await syncClientContacts(connection, safeId, contacts);

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message || "Error del servidor" });
    } finally {
        connection.release();
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

        await ensureContactsTable(connection);

        await connection.query(
            `DELETE FROM client_contacts WHERE id_prospect = ?`,
            [safeId]
        );

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

exports.updateClientProfile = exports.updateClient;
