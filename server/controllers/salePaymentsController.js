const db = require("../config/db");

exports.getPaymentsBySale = async (req, res) => {
    try {
        const { saleId } = req.params;

        const [rows] = await db.query(
            `
            SELECT *
            FROM sale_payments
            WHERE id_sale = ?
            ORDER BY payment_date DESC
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
        const userId = req.auth.sub;

        const { id_sale, amount, payment_method, reference } = req.body;

        await db.query(
            `
            INSERT INTO sale_payments
            (
            id_sale,
            amount,
            payment_method,
            reference,
            created_by
            )
            VALUES (?,?,?,?,?)
            `,
            [id_sale, amount, payment_method, reference, userId],
        );

        const [totals] = await db.query(
            `
            SELECT
            s.total,
            COALESCE(SUM(p.amount),0) AS paid
            FROM sales s
            LEFT JOIN sale_payments p
            ON p.id_sale = s.id_sale
            WHERE s.id_sale = ?
            GROUP BY s.id_sale
            `,
            [id_sale],
        );

        const { total, paid } = totals[0];

        let status = "Pendiente";

        if (paid >= total) {
            status = "Pagado";
        } else if (paid > 0) {
            status = "Pagado Parcial";
        }

        await db.query(
            `
            UPDATE sales
            SET payment_status = ?
            WHERE id_sale = ?
            `,
            [status, id_sale],
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};

exports.deletePayment = async (req, res) => {
    try {
        const { id } = req.params;

        await db.query(
            `
            DELETE FROM sale_payments
            WHERE id_payment = ?
            `,
            [id],
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};
