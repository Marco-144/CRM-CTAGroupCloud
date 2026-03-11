const db = require("../config/db");

async function getCompatibleCotizacionStatus(connection) {
    try {
        const [rows] = await connection.query(
            `SELECT COLUMN_TYPE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'cotizacion'
               AND COLUMN_NAME = 'status'
             LIMIT 1`
        );

        const columnType = String(rows?.[0]?.COLUMN_TYPE || "").toLowerCase();

        if (columnType.includes("completada")) {
            return "Completada";
        }

        if (columnType.includes("inactivo")) {
            return "Inactivo";
        }
    } catch (_error) {
        // Fallback below keeps operation compatible if metadata query fails.
    }

    return "Inactivo";
}

async function getCompatibleProspectInactiveStatus(connection) {
    try {
        const [rows] = await connection.query(
            `SELECT COLUMN_TYPE
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'prospects'
               AND COLUMN_NAME = 'status'
             LIMIT 1`
        );

        const columnType = String(rows?.[0]?.COLUMN_TYPE || "").toLowerCase();

        if (columnType.includes("inactivo")) {
            return "Inactivo";
        }

        if (columnType.includes("inactive")) {
            return "Inactive";
        }
    } catch (_error) {
        // Keep fallback to avoid interrupting sale creation.
    }

    return "Inactivo";
}

exports.getSales = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
            s.id_sale,
            s.sale_folio,
            p.company,
            s.sale_date,
            s.total,
            COALESCE(payments.total_paid, 0) AS paid_amount,
            GREATEST(s.total - COALESCE(payments.total_paid, 0), 0) AS pending_amount,
            s.payment_status,
            s.sale_status
            FROM sales s
            INNER JOIN prospects p
            ON p.id_prospect = s.id_prospect
            LEFT JOIN (
                SELECT id_sale, SUM(amount) AS total_paid
                FROM sale_payments
                GROUP BY id_sale
            ) payments
            ON payments.id_sale = s.id_sale
            ORDER BY s.id_sale DESC
        `);

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.getSale = async (req, res) => {
    try {
        const { id } = req.params;

        const [sale] = await db.query(
            `
            SELECT *
            FROM sales
            WHERE id_sale = ?
        `,
            [id],
        );

        const [payments] = await db.query(
            `
            SELECT *
            FROM sale_payments
            WHERE id_sale = ?
            `,
            [id],
        );

        res.json({
            success: true,
            data: {
                sale: sale[0],
                payments,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.createFromQuote = async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const quoteId = Number(req.params.id);
        const userId = Number(req.auth.sub || 1);

        const {
            clientProfile = {},
            payment = {},
            notes = ""
        } = req.body || {};

        const [quote] = await connection.query(
            `SELECT *
             FROM cotizacion
             WHERE id_cotizacion = ?
             LIMIT 1`,
            [quoteId],
        );

        if (!quote.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, message: "Cotizacion no encontrada" });
        }

        const q = quote[0];

        const [existingSale] = await connection.query(
            `SELECT id_sale
             FROM sales
             WHERE id_cotizacion = ?
             LIMIT 1`,
            [quoteId]
        );

        if (existingSale.length) {
            await connection.rollback();
            return res.status(409).json({
                success: false,
                message: "La cotizacion ya tiene una venta asociada",
                id_sale: existingSale[0].id_sale
            });
        }

        await connection.query(
            `INSERT INTO client_profiles
               (id_prospect, rfc, fiscal_name, fiscal_regime, billing_email, address, city, state, postal_code, country, tax_certificate_pdf)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
               tax_certificate_pdf = COALESCE(VALUES(tax_certificate_pdf), tax_certificate_pdf)`,
            [
                Number(q.id_prospect),
                clientProfile.rfc || null,
                clientProfile.fiscal_name || null,
                clientProfile.fiscal_regime || null,
                clientProfile.billing_email || null,
                clientProfile.address || null,
                clientProfile.city || null,
                clientProfile.state || null,
                clientProfile.postal_code || null,
                clientProfile.country || "Mexico",
                clientProfile.tax_certificate_pdf || null,
            ]
        );

        const [[nextSaleRow]] = await connection.query(
            `SELECT COALESCE(MAX(id_sale), 0) + 1 AS nextId
             FROM sales
             FOR UPDATE`
        );

        const saleFolio = `SV-${String(nextSaleRow.nextId).padStart(5, "0")}`;

        const [result] = await connection.query(
            `INSERT INTO sales
              (
                id_cotizacion,
                id_prospect,
                sale_folio,
                subtotal,
                iva,
                total,
                currency,
                payment_status,
                sale_status,
                notes,
                created_by,
                created_at,
                updated_at
              )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
                q.id_cotizacion,
                q.id_prospect,
                saleFolio,
                Number(q.subtotal || 0),
                Number(q.iva || 0),
                Number(q.total || 0),
                q.moneda || "MXN",
                "Pendiente",
                "Activa",
                notes || null,
                userId
            ],
        );

        const saleId = result.insertId;
        const initialAmount = Number(payment.amount || 0);

        if (initialAmount > 0) {
            await connection.query(
                `INSERT INTO sale_payments
                  (id_sale, amount, currency, payment_method, reference, notes, created_by, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    saleId,
                    initialAmount,
                    payment.currency || q.moneda || "MXN",
                    payment.payment_method || null,
                    payment.reference || null,
                    payment.notes || null,
                    userId,
                ]
            );

            const total = Number(q.total || 0);
            let paymentStatus = "Pagado Parcial";

            if (initialAmount >= total) {
                paymentStatus = "Pagado";
            }

            await connection.query(
                `UPDATE sales
                 SET payment_status = ?
                 WHERE id_sale = ?`,
                [paymentStatus, saleId]
            );
        }

        const prospectStatusToSet = await getCompatibleProspectInactiveStatus(connection);

        await connection.query(
            `UPDATE prospects
             SET is_client = 1,
                 status = ?
             WHERE id_prospect = ?`,
            [prospectStatusToSet, q.id_prospect],
        );

        const quoteStatusToSet = await getCompatibleCotizacionStatus(connection);

        await connection.query(
            `UPDATE cotizacion
             SET status = ?
             WHERE id_cotizacion = ?`,
            [quoteStatusToSet, q.id_cotizacion]
        );

        await connection.commit();

        res.status(201).json({
            success: true,
            id_sale: saleId,
            sale_folio: saleFolio,
        });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ success: false, message: err.message || "Error del servidor" });
    } finally {
        connection.release();
    }
};

exports.updateSaleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { sale_status } = req.body;

        await db.query(
            `
            UPDATE sales
            SET sale_status = ?
            WHERE id_sale = ?
            `,
            [sale_status, id],
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.deleteSale = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            `
            DELETE FROM sales
            WHERE id_sale = ?
            `,
            [id],
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};
