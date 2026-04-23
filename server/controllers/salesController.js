const db = require("../config/db");
const {
    generateMonthlyRecurringCharges,
    ensureRecurringProfileForSale,
    recalculateRecurringChargeStatus,
} = require("../services/salesRecurringService");

const GLOBAL_IVA_RATE = 0.16;
let recurringChargeIvaFlagExists = null;

async function hasRecurringChargeIvaFlag(connection = db) {
    if (recurringChargeIvaFlagExists !== null) {
        return recurringChargeIvaFlagExists;
    }

    try {
        const [rows] = await connection.query(
            `SELECT 1
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'sale_recurring_charges'
               AND COLUMN_NAME = 'is_amount_with_iva'
             LIMIT 1`
        );

        recurringChargeIvaFlagExists = rows.length > 0;
    } catch (_error) {
        recurringChargeIvaFlagExists = false;
    }

    return recurringChargeIvaFlagExists;
}

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
        await generateMonthlyRecurringCharges();

        const [rows] = await db.query(`
            SELECT
            s.id_sale,
            s.sale_folio,
            p.company,
            s.sale_date,
            s.total,
            COALESCE(payments.total_paid, 0) AS paid_amount,
            GREATEST(s.total - COALESCE(payments.total_paid, 0), 0) AS base_pending_amount,
            COALESCE(recurring.recurring_pending_total, 0) AS recurring_pending_amount,
            COALESCE(recurring.recurring_pending_current_month, 0) AS recurring_current_month_pending_amount,
            GREATEST(s.total - COALESCE(payments.total_paid, 0), 0) AS pending_amount,
            GREATEST(s.total - COALESCE(payments.total_paid, 0), 0) + COALESCE(recurring.recurring_pending_total, 0) AS total_pending_amount,
            s.payment_status,
            s.sale_status,
            CASE WHEN recurring.id_sale IS NULL THEN 0 ELSE 1 END AS has_recurring
            FROM sales s
            INNER JOIN prospects p
            ON p.id_prospect = s.id_prospect
            LEFT JOIN (
                SELECT id_sale, SUM(amount) AS total_paid
                FROM sale_payments
                WHERE id_recurring_charge IS NULL
                GROUP BY id_sale
            ) payments
            ON payments.id_sale = s.id_sale
            LEFT JOIN (
                SELECT
                    rp.id_sale,
                    SUM(GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0)) AS recurring_pending_total,
                    SUM(
                        CASE
                            WHEN rc.charge_month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
                            THEN GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0)
                            ELSE 0
                        END
                    ) AS recurring_pending_current_month
                FROM sale_recurring_profiles rp
                INNER JOIN sale_recurring_charges rc
                    ON rc.id_profile = rp.id_profile
                LEFT JOIN (
                    SELECT
                        id_recurring_charge,
                        SUM(amount) AS paid
                    FROM sale_payments
                    WHERE id_recurring_charge IS NOT NULL
                    GROUP BY id_recurring_charge
                ) paid_by_charge
                    ON paid_by_charge.id_recurring_charge = rc.id_recurring_charge
                WHERE rp.is_active = 1
                GROUP BY rp.id_sale
            ) recurring
            ON recurring.id_sale = s.id_sale
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

        await generateMonthlyRecurringCharges();

        const [sale] = await db.query(
            `
            SELECT
                s.*, 
                c.folio AS quote_folio,
                c.id_cotizacion,
                c.moneda AS quote_currency,
                c.tipo_cambio AS quote_exchange_rate,
                p.company
            FROM sales s
            LEFT JOIN cotizacion c
                ON c.id_cotizacion = s.id_cotizacion
            LEFT JOIN prospects p
                ON p.id_prospect = s.id_prospect
            WHERE s.id_sale = ?
        `,
            [id],
        );

        const [quoteItems] = await db.query(
            `
            SELECT
                cd.id_detalle_cotizacion,
                cd.descripcion,
                cd.periodicidad,
                cd.cantidad,
                cd.costo_unitario,
                (cd.cantidad * cd.costo_unitario) AS line_total
            FROM sales s
            INNER JOIN cotizacion_detalle cd
                ON cd.id_cotizacion = s.id_cotizacion
            WHERE s.id_sale = ?
            ORDER BY cd.id_detalle_cotizacion ASC
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

        const [recurringCharges] = await db.query(
            `
            SELECT
                rc.id_recurring_charge,
                rc.charge_month,
                rc.amount,
                rc.status,
                COALESCE(paid_by_charge.paid, 0) AS paid_amount,
                GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0) AS pending_amount
            FROM sale_recurring_profiles rp
            INNER JOIN sale_recurring_charges rc
                ON rc.id_profile = rp.id_profile
            LEFT JOIN (
                SELECT
                    id_recurring_charge,
                    SUM(amount) AS paid
                FROM sale_payments
                WHERE id_recurring_charge IS NOT NULL
                GROUP BY id_recurring_charge
            ) paid_by_charge
                ON paid_by_charge.id_recurring_charge = rc.id_recurring_charge
            WHERE rp.id_sale = ?
            ORDER BY rc.charge_month DESC
            `,
            [id],
        );

        res.json({
            success: true,
            data: {
                sale: sale[0],
                quote_items: quoteItems,
                recurring_charges: recurringCharges,
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

        await ensureRecurringProfileForSale(connection, saleId, q.id_cotizacion, new Date());

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

        const recurringActive = String(sale_status || "").trim().toLowerCase() === "activa" ? 1 : 0;

        await db.query(
            `
            UPDATE sale_recurring_profiles
            SET is_active = ?
            WHERE id_sale = ?
            `,
            [recurringActive, id],
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.getRecurringDashboardSummary = async (req, res) => {
    try {
        await generateMonthlyRecurringCharges();

        const [rows] = await db.query(
            `SELECT
                rc.id_recurring_charge,
                s.id_sale,
                s.sale_folio,
                p.company,
                rc.charge_month,
                rc.amount,
                COALESCE(paid_by_charge.paid, 0) AS paid_amount,
                GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0) AS pending_amount
             FROM sale_recurring_profiles rp
             INNER JOIN sales s
                ON s.id_sale = rp.id_sale
             INNER JOIN prospects p
                ON p.id_prospect = s.id_prospect
             INNER JOIN sale_recurring_charges rc
                ON rc.id_profile = rp.id_profile
             LEFT JOIN (
                SELECT
                    id_recurring_charge,
                    SUM(amount) AS paid
                FROM sale_payments
                WHERE id_recurring_charge IS NOT NULL
                GROUP BY id_recurring_charge
             ) paid_by_charge
                ON paid_by_charge.id_recurring_charge = rc.id_recurring_charge
             WHERE rp.is_active = 1
               AND s.sale_status = 'Activa'
               AND rc.charge_month = DATE_FORMAT(CURDATE(), '%Y-%m-01')
             HAVING pending_amount > 0
             ORDER BY p.company ASC, s.sale_folio ASC`
        );

        const totalPending = rows.reduce((acc, item) => acc + Number(item.pending_amount || 0), 0);

        res.json({
            success: true,
            data: {
                monthly_pending_amount: totalPending,
                pending_count: rows.length,
                pending_items: rows,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getRecurringBoard = async (req, res) => {
    try {
        await generateMonthlyRecurringCharges();

        const hasIvaFlag = await hasRecurringChargeIvaFlag();

        const [rows] = await db.query(
            `SELECT
                rc.id_recurring_charge,
                s.id_sale,
                s.sale_folio,
                p.company,
                rc.charge_month,
                rc.amount,
                ${hasIvaFlag ? "rc.is_amount_with_iva" : "1 AS is_amount_with_iva"},
                COALESCE(paid_by_charge.paid, 0) AS paid_amount,
                GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0) AS pending_amount,
                rc.status,
                rp.next_charge_date
             FROM sale_recurring_profiles rp
             INNER JOIN sales s
                ON s.id_sale = rp.id_sale
             INNER JOIN prospects p
                ON p.id_prospect = s.id_prospect
             INNER JOIN sale_recurring_charges rc
                ON rc.id_profile = rp.id_profile
             LEFT JOIN (
                SELECT
                    id_recurring_charge,
                    SUM(amount) AS paid
                FROM sale_payments
                WHERE id_recurring_charge IS NOT NULL
                GROUP BY id_recurring_charge
             ) paid_by_charge
                ON paid_by_charge.id_recurring_charge = rc.id_recurring_charge
                         WHERE rp.is_active = 1
                             AND s.sale_status = 'Activa'
             ORDER BY
                                rc.charge_month DESC,
                CASE
                    WHEN rc.status = 'Pendiente' THEN 1
                    WHEN rc.status = 'Pagado Parcial' THEN 2
                    ELSE 3
                END,
                p.company ASC,
                s.sale_folio ASC`
        );

        const totalPending = rows.reduce((acc, item) => acc + Number(item.pending_amount || 0), 0);
        const totalPaid = rows.reduce((acc, item) => acc + Number(item.paid_amount || 0), 0);
        res.json({
            success: true,
            data: {
                month_label: "Histórico mensual",
                pending_amount: totalPending,
                paid_amount: totalPaid,
                pending_count: rows.filter((item) => Number(item.pending_amount || 0) > 0).length,
                paid_count: rows.filter((item) => String(item.status || "") === "Pagado").length,
                items: rows,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.updateRecurringCharge = async (req, res) => {
    try {
        const chargeId = Number(req.params.id || 0);
        const netAmount = Number(req.body.net_amount || 0);
        const applyIva = !!req.body.apply_iva;

        if (!chargeId || !Number.isFinite(netAmount) || netAmount <= 0) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const hasIvaFlag = await hasRecurringChargeIvaFlag();
        if (!hasIvaFlag && !applyIva) {
            return res.status(400).json({
                success: false,
                message: "Falta migracion de IVA recurrente. Ejecuta el SQL de migracion para manejar cargos sin IVA.",
            });
        }

        const amount = applyIva
            ? Math.round(netAmount * (1 + GLOBAL_IVA_RATE) * 100) / 100
            : Math.round(netAmount * 100) / 100;

        const [result] = await db.query(
            hasIvaFlag
                ? `UPDATE sale_recurring_charges
                   SET amount = ?,
                       is_amount_with_iva = ?
                   WHERE id_recurring_charge = ?`
                : `UPDATE sale_recurring_charges
                   SET amount = ?
                   WHERE id_recurring_charge = ?`,
            hasIvaFlag ? [amount, applyIva ? 1 : 0, chargeId] : [amount, chargeId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Cargo mensual no encontrado" });
        }

        await recalculateRecurringChargeStatus(chargeId);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Error del servidor" });
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
