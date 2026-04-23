const db = require("../config/db");

const GLOBAL_IVA_RATE = 0.16;

function applyGlobalIva(amount) {
    const netAmount = Number(amount || 0);
    if (!Number.isFinite(netAmount) || netAmount <= 0) return 0;

    return Math.round(netAmount * (1 + GLOBAL_IVA_RATE) * 100) / 100;
}

function toDateOnly(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const [year, month, day] = raw.slice(0, 10).split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;

    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getMonthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
    return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

async function ensureProfilesForExistingSales(connection) {
    const [rows] = await connection.query(
        `SELECT
            s.id_sale,
            s.sale_date,
            COALESCE(SUM(cd.cantidad * cd.costo_unitario), 0) AS monthly_amount_net
         FROM sales s
         INNER JOIN cotizacion_detalle cd
            ON cd.id_cotizacion = s.id_cotizacion
         WHERE cd.periodicidad = 'Mensual'
           AND s.sale_status = 'Activa'
         GROUP BY s.id_sale, s.sale_date`
    );

    for (const row of rows) {
        const monthlyAmount = applyGlobalIva(row.monthly_amount_net);
        if (monthlyAmount <= 0) continue;

        const saleDate = toDateOnly(row.sale_date) || new Date();
        const firstChargeMonth = getMonthStart(saleDate);

        await connection.query(
            `INSERT INTO sale_recurring_profiles
            (
                id_sale,
                monthly_amount,
                start_date,
                next_charge_date,
                is_active
            )
            VALUES (?, ?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE
                monthly_amount = VALUES(monthly_amount)`,
            [
                Number(row.id_sale),
                monthlyAmount,
                formatDateOnly(firstChargeMonth),
                formatDateOnly(firstChargeMonth),
            ]
        );
    }
}

async function generateMonthlyRecurringCharges() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await ensureProfilesForExistingSales(connection);

        const [profiles] = await connection.query(
            `SELECT
                rp.id_profile,
                rp.id_sale,
                rp.monthly_amount,
                rp.start_date,
                rp.next_charge_date
             FROM sale_recurring_profiles rp
             INNER JOIN sales s
                ON s.id_sale = rp.id_sale
             WHERE rp.is_active = 1
               AND s.sale_status = 'Activa'`
        );

        const now = new Date();
        const currentMonthStart = getMonthStart(now);

        for (const profile of profiles) {
            const nextChargeDate = toDateOnly(profile.next_charge_date)
                || toDateOnly(profile.start_date)
                || currentMonthStart;

            let cursor = getMonthStart(nextChargeDate);

            while (cursor <= currentMonthStart) {
                await connection.query(
                    `INSERT IGNORE INTO sale_recurring_charges
                    (
                        id_profile,
                        charge_month,
                        amount,
                        status
                    )
                    VALUES (?, ?, ?, 'Pendiente')`,
                    [
                        Number(profile.id_profile),
                        formatDateOnly(cursor),
                        Number(profile.monthly_amount || 0),
                    ]
                );

                cursor = addMonths(cursor, 1);
            }

            await connection.query(
                `UPDATE sale_recurring_profiles
                 SET next_charge_date = ?
                 WHERE id_profile = ?`,
                [formatDateOnly(cursor), Number(profile.id_profile)]
            );
        }

        await connection.query(
            `UPDATE sale_recurring_charges rc
             LEFT JOIN (
                SELECT
                    id_recurring_charge,
                    COALESCE(SUM(amount), 0) AS paid
                FROM sale_payments
                WHERE id_recurring_charge IS NOT NULL
                GROUP BY id_recurring_charge
             ) p
                ON p.id_recurring_charge = rc.id_recurring_charge
             SET rc.status = CASE
                WHEN COALESCE(p.paid, 0) >= rc.amount THEN 'Pagado'
                WHEN COALESCE(p.paid, 0) > 0 THEN 'Pagado Parcial'
                ELSE 'Pendiente'
             END`
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function ensureRecurringProfileForSale(connection, saleId, quoteId, saleDate) {
    const [rows] = await connection.query(
        `SELECT
            COALESCE(SUM(cantidad * costo_unitario), 0) AS monthly_amount_net
         FROM cotizacion_detalle
         WHERE id_cotizacion = ?
           AND periodicidad = 'Mensual'`,
        [Number(quoteId)]
    );

    const monthlyAmount = applyGlobalIva(rows?.[0]?.monthly_amount_net);

    if (monthlyAmount <= 0) {
        return;
    }

    const baseDate = toDateOnly(saleDate) || new Date();
    const firstChargeMonth = getMonthStart(baseDate);

    await connection.query(
        `INSERT INTO sale_recurring_profiles
        (
            id_sale,
            monthly_amount,
            start_date,
            next_charge_date,
            is_active
        )
        VALUES (?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
            monthly_amount = VALUES(monthly_amount),
            start_date = VALUES(start_date),
            is_active = 1`,
        [
            Number(saleId),
            monthlyAmount,
            formatDateOnly(firstChargeMonth),
            formatDateOnly(firstChargeMonth),
        ]
    );
}

async function recalculateRecurringChargeStatus(chargeId) {
    const safeChargeId = Number(chargeId || 0);
    if (!safeChargeId) return;

    const [rows] = await db.query(
        `SELECT
            rc.amount,
            COALESCE(SUM(sp.amount), 0) AS paid
         FROM sale_recurring_charges rc
         LEFT JOIN sale_payments sp
            ON sp.id_recurring_charge = rc.id_recurring_charge
         WHERE rc.id_recurring_charge = ?
         GROUP BY rc.id_recurring_charge, rc.amount`,
        [safeChargeId]
    );

    if (!rows.length) return;

    const amount = Number(rows[0].amount || 0);
    const paid = Number(rows[0].paid || 0);

    let status = "Pendiente";

    if (paid >= amount) {
        status = "Pagado";
    } else if (paid > 0) {
        status = "Pagado Parcial";
    }

    await db.query(
        `UPDATE sale_recurring_charges
         SET status = ?
         WHERE id_recurring_charge = ?`,
        [status, safeChargeId]
    );
}

module.exports = {
    generateMonthlyRecurringCharges,
    ensureRecurringProfileForSale,
    recalculateRecurringChargeStatus,
};
