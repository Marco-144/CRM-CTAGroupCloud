const db = require("../config/db");
const {
    generateMonthlyRecurringCharges,
    recalculateRecurringChargeStatus,
} = require("../services/salesRecurringService");

async function recalculateSaleBaseStatus(saleId) {
    const [totals] = await db.query(
        `
        SELECT
            s.total,
            COALESCE(SUM(p.amount),0) AS paid
        FROM sales s
        LEFT JOIN sale_payments p
            ON p.id_sale = s.id_sale
           AND p.id_recurring_charge IS NULL
        WHERE s.id_sale = ?
        GROUP BY s.id_sale
        `,
        [saleId],
    );

    if (!totals.length) return;

    const { total, paid } = totals[0];

    let status = "Pendiente";

    if (Number(paid) >= Number(total)) {
        status = "Pagado";
    } else if (Number(paid) > 0) {
        status = "Pagado Parcial";
    }

    await db.query(
        `
        UPDATE sales
        SET payment_status = ?
        WHERE id_sale = ?
        `,
        [status, saleId],
    );
}

exports.getPaymentsBySale = async (req, res) => {
    try {
        const { saleId } = req.params;

        const [rows] = await db.query(
            `
            SELECT
                sp.*,
                rc.charge_month,
                rc.status AS recurring_status
            FROM sale_payments sp
            LEFT JOIN sale_recurring_charges rc
                ON rc.id_recurring_charge = sp.id_recurring_charge
            WHERE sp.id_sale = ?
            ORDER BY sp.payment_date DESC, sp.id_payment DESC
            `,
            [saleId],
        );

        res.json({ success: true, data: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.createPayment = async (req, res) => {
    try {
        await generateMonthlyRecurringCharges();

        const userId = req.auth.sub;

        const {
            id_sale,
            amount,
            payment_method,
            reference,
            notes,
            recurring_charge_id,
            apply_to,
        } = req.body;

        let remainingAmount = Number(amount || 0);
        const forcedRecurringChargeId = Number(recurring_charge_id || 0);
        const applyTo = String(apply_to || "base").toLowerCase() === "recurring" ? "recurring" : "base";

        if (!id_sale || Number.isNaN(remainingAmount) || remainingAmount <= 0 || !payment_method) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        if (applyTo === "base") {
            await db.query(
                `
                INSERT INTO sale_payments
                (
                    id_sale,
                    amount,
                    payment_method,
                    reference,
                    notes,
                    created_by
                )
                VALUES (?,?,?,?,?,?)
                `,
                [id_sale, remainingAmount, payment_method, reference || null, notes || null, userId],
            );

            await recalculateSaleBaseStatus(id_sale);

            return res.json({ success: true });
        }

        const [recurringCharges] = await db.query(
            `
            SELECT
                rc.id_recurring_charge,
                rc.amount,
                COALESCE(paid_by_charge.paid, 0) AS paid_amount,
                GREATEST(rc.amount - COALESCE(paid_by_charge.paid, 0), 0) AS pending_amount
            FROM sale_recurring_profiles rp
            INNER JOIN sales s
                ON s.id_sale = rp.id_sale
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
              AND rp.is_active = 1
              AND s.sale_status = 'Activa'
            HAVING pending_amount > 0
            ORDER BY rc.charge_month ASC, rc.id_recurring_charge ASC
            `,
            [id_sale]
        );

        const recurringTotalPending = recurringCharges.reduce(
            (acc, row) => acc + Number(row.pending_amount || 0),
            0,
        );

        if (!recurringCharges.length || recurringTotalPending <= 0) {
            return res.status(400).json({ success: false, message: "No hay cargos mensuales pendientes para aplicar este pago" });
        }

        if (remainingAmount > recurringTotalPending) {
            return res.status(400).json({ success: false, message: "El monto excede el total pendiente mensual. Registra el excedente como pago base" });
        }

        if (forcedRecurringChargeId > 0 && remainingAmount > 0) {
            const forcedCharge = recurringCharges.find(
                (row) => Number(row.id_recurring_charge) === forcedRecurringChargeId,
            );

            if (forcedCharge) {
                const forcedPending = Number(forcedCharge.pending_amount || 0);

                if (forcedPending > 0) {
                    const forcedApplied = Math.min(remainingAmount, forcedPending);

                    await db.query(
                        `
                        INSERT INTO sale_payments
                        (
                            id_sale,
                            id_recurring_charge,
                            amount,
                            payment_method,
                            reference,
                            notes,
                            created_by
                        )
                        VALUES (?,?,?,?,?,?,?)
                        `,
                        [id_sale, forcedRecurringChargeId, forcedApplied, payment_method, reference || null, notes || null, userId],
                    );

                    remainingAmount -= forcedApplied;
                    await recalculateRecurringChargeStatus(forcedRecurringChargeId);
                }
            }
        }

        for (const charge of recurringCharges) {
            if (remainingAmount <= 0) break;

            if (forcedRecurringChargeId > 0 && Number(charge.id_recurring_charge) === forcedRecurringChargeId) {
                continue;
            }

            const pending = Number(charge.pending_amount || 0);
            if (pending <= 0) continue;

            const applied = Math.min(remainingAmount, pending);

            await db.query(
                `
                INSERT INTO sale_payments
                (
                    id_sale,
                    id_recurring_charge,
                    amount,
                    payment_method,
                    reference,
                    notes,
                    created_by
                )
                VALUES (?,?,?,?,?,?,?)
                `,
                [id_sale, charge.id_recurring_charge, applied, payment_method, reference || null, notes || null, userId],
            );

            remainingAmount -= applied;

            await recalculateRecurringChargeStatus(charge.id_recurring_charge);
        }

        await recalculateSaleBaseStatus(id_sale);

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.updatePayment = async (req, res) => {
    try {
        await generateMonthlyRecurringCharges();

        const { id } = req.params;
        const { amount, payment_method, reference, notes } = req.body;

        const paymentAmount = Number(amount || 0);

        if (Number.isNaN(paymentAmount) || paymentAmount <= 0 || !payment_method) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const [existingRows] = await db.query(
            `
            SELECT id_sale, id_recurring_charge
            FROM sale_payments
            WHERE id_payment = ?
            LIMIT 1
            `,
            [id]
        );

        if (!existingRows.length) {
            return res.status(404).json({ success: false, message: "Pago no encontrado" });
        }

        const saleId = Number(existingRows[0].id_sale);
        const recurringChargeId = Number(existingRows[0].id_recurring_charge || 0);

        await db.query(
            `
            UPDATE sale_payments
            SET amount = ?,
                payment_method = ?,
                reference = ?,
                notes = ?
            WHERE id_payment = ?
            `,
            [paymentAmount, payment_method, reference || null, notes || null, id]
        );

        await recalculateSaleBaseStatus(saleId);

        if (recurringChargeId) {
            await recalculateRecurringChargeStatus(recurringChargeId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.deletePayment = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await db.query(
            `
            SELECT id_sale, id_recurring_charge
            FROM sale_payments
            WHERE id_payment = ?
            LIMIT 1
            `,
            [id]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Pago no encontrado" });
        }

        const saleId = Number(rows[0].id_sale);
        const recurringChargeId = Number(rows[0].id_recurring_charge || 0);

        await db.query(
            `
            DELETE FROM sale_payments
            WHERE id_payment = ?
            `,
            [id],
        );

        await recalculateSaleBaseStatus(saleId);

        if (recurringChargeId) {
            await recalculateRecurringChargeStatus(recurringChargeId);
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};
