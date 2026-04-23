const db = require("../config/db");
const {
    isAdminUser,
    generatePendingPayrollCharges,
    recalculatePayrollChargeStatus,
} = require("../services/payrollService");

async function ensureAdmin(req, res) {
    const authUserId = Number(req.auth?.sub || 0);

    if (!authUserId) {
        res.status(401).json({ success: false, message: "Sesion invalida" });
        return false;
    }

    const isAdmin = await isAdminUser(authUserId);

    if (!isAdmin) {
        res.status(403).json({ success: false, message: "Solo administrador" });
        return false;
    }

    return true;
}

exports.getPayrollUsers = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const [rows] = await db.query(
            `SELECT
                u.id,
                u.username,
                u.name,
                u.email,
                pe.id_payroll_employee,
                pe.is_active
             FROM users u
             LEFT JOIN payroll_employees pe
                ON pe.id_user = u.id
             ORDER BY u.name ASC`
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error al obtener usuarios para nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getPayrollEmployees = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        await generatePendingPayrollCharges();

        const [rows] = await db.query(
            `SELECT
                pe.id_payroll_employee,
                pe.id_user,
                u.name AS employee_name,
                u.username,
                pe.salary_net,
                pe.pay_frequency,
                pe.start_date,
                pe.is_active,
                COALESCE(SUM(pc.amount_net), 0) AS total_charged,
                COALESCE(SUM(pp.amount), 0) AS total_paid,
                GREATEST(COALESCE(SUM(pc.amount_net), 0) - COALESCE(SUM(pp.amount), 0), 0) AS total_pending
             FROM payroll_employees pe
             INNER JOIN users u
                ON u.id = pe.id_user
             LEFT JOIN payroll_charges pc
                ON pc.id_payroll_employee = pe.id_payroll_employee
             LEFT JOIN payroll_payments pp
                ON pp.id_payroll_charge = pc.id_payroll_charge
             GROUP BY
                pe.id_payroll_employee,
                pe.id_user,
                u.name,
                u.username,
                pe.salary_net,
                pe.pay_frequency,
                pe.start_date,
                pe.is_active
             ORDER BY pe.id_payroll_employee DESC`
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error al obtener empleados de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createPayrollEmployee = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const authUserId = Number(req.auth.sub);
        const { id_user, salary_net, pay_frequency, start_date, is_active } = req.body;

        if (!id_user || !salary_net || !pay_frequency) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const safeSalary = Number(salary_net);

        if (Number.isNaN(safeSalary) || safeSalary <= 0) {
            return res.status(400).json({ success: false, message: "Sueldo neto invalido" });
        }

        const validFrequencies = ["Semanal", "Quincenal", "Mensual"];
        if (!validFrequencies.includes(pay_frequency)) {
            return res.status(400).json({ success: false, message: "Periodicidad invalida" });
        }

        const safeStartDate = start_date || new Date().toISOString().slice(0, 10);
        const safeActive = is_active === undefined ? 1 : Number(Boolean(is_active));

        const [existing] = await db.query(
            `SELECT id_payroll_employee
             FROM payroll_employees
             WHERE id_user = ?
             LIMIT 1`,
            [Number(id_user)]
        );

        if (existing.length) {
            return res.status(409).json({ success: false, message: "El usuario ya esta registrado como empleado" });
        }

        const [result] = await db.query(
            `INSERT INTO payroll_employees
            (
                id_user,
                salary_net,
                pay_frequency,
                start_date,
                is_active,
                created_by
            )
            VALUES (?,?,?,?,?,?)`,
            [Number(id_user), safeSalary, pay_frequency, safeStartDate, safeActive, authUserId]
        );

        await generatePendingPayrollCharges();

        res.status(201).json({ success: true, id: result.insertId });
    } catch (error) {
        console.error("Error al crear empleado de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.updatePayrollEmployee = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const { id } = req.params;
        const { salary_net, pay_frequency, start_date, is_active } = req.body;

        if (!salary_net || !pay_frequency) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const safeSalary = Number(salary_net);

        if (Number.isNaN(safeSalary) || safeSalary <= 0) {
            return res.status(400).json({ success: false, message: "Sueldo neto invalido" });
        }

        const validFrequencies = ["Semanal", "Quincenal", "Mensual"];
        if (!validFrequencies.includes(pay_frequency)) {
            return res.status(400).json({ success: false, message: "Periodicidad invalida" });
        }

        const safeStartDate = start_date || new Date().toISOString().slice(0, 10);
        const safeActive = is_active === undefined ? 1 : Number(Boolean(is_active));

        const [result] = await db.query(
            `UPDATE payroll_employees
             SET salary_net = ?,
                 pay_frequency = ?,
                 start_date = ?,
                 is_active = ?
             WHERE id_payroll_employee = ?`,
            [safeSalary, pay_frequency, safeStartDate, safeActive, Number(id)]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Empleado no encontrado" });
        }

        await db.query(
            `UPDATE payroll_charges
             SET amount_net = ?,
                 pay_frequency_snapshot = ?
             WHERE id_payroll_employee = ?
               AND status = 'Pendiente'`,
            [safeSalary, pay_frequency, Number(id)]
        );

        await generatePendingPayrollCharges();

        res.json({ success: true });
    } catch (error) {
        console.error("Error al actualizar empleado de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.deletePayrollEmployee = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const { id } = req.params;

        const [result] = await db.query(
            `DELETE FROM payroll_employees
             WHERE id_payroll_employee = ?`,
            [Number(id)]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ success: false, message: "Empleado no encontrado" });
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error al eliminar empleado de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getPayrollCharges = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        await generatePendingPayrollCharges();

        const employeeId = Number(req.query.employeeId || 0);
        const status = String(req.query.status || "").trim();

        const filters = [];
        const params = [];

        if (employeeId) {
            filters.push("pc.id_payroll_employee = ?");
            params.push(employeeId);
        }

        if (status) {
            filters.push("pc.status = ?");
            params.push(status);
        }

        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

        const [rows] = await db.query(
            `SELECT
                pc.id_payroll_charge,
                pc.id_payroll_employee,
                u.name AS employee_name,
                pc.due_date,
                pc.period_start,
                pc.period_end,
                pc.amount_net,
                pc.pay_frequency_snapshot,
                pc.status,
                COALESCE(SUM(pp.amount), 0) AS paid_amount,
                GREATEST(pc.amount_net - COALESCE(SUM(pp.amount), 0), 0) AS pending_amount
             FROM payroll_charges pc
             INNER JOIN payroll_employees pe
                ON pe.id_payroll_employee = pc.id_payroll_employee
             INNER JOIN users u
                ON u.id = pe.id_user
             LEFT JOIN payroll_payments pp
                ON pp.id_payroll_charge = pc.id_payroll_charge
             ${whereClause}
             GROUP BY
                pc.id_payroll_charge,
                pc.id_payroll_employee,
                u.name,
                pc.due_date,
                pc.period_start,
                pc.period_end,
                pc.amount_net,
                pc.pay_frequency_snapshot,
                pc.status
             ORDER BY pc.due_date DESC, pc.id_payroll_charge DESC`,
            params
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error al obtener cargos de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getPayrollChargePayments = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const { chargeId } = req.params;

        const [rows] = await db.query(
            `SELECT
                id_payroll_payment,
                id_payroll_charge,
                amount,
                payment_method,
                reference,
                notes,
                payment_date,
                created_at
             FROM payroll_payments
             WHERE id_payroll_charge = ?
             ORDER BY payment_date DESC, id_payroll_payment DESC`,
            [Number(chargeId)]
        );

        res.json({ success: true, data: rows });
    } catch (error) {
        console.error("Error al obtener pagos de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.createPayrollPayment = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const authUserId = Number(req.auth.sub);
        const { id_payroll_charge, amount, payment_method, reference, notes, payment_date } = req.body;

        if (!id_payroll_charge || !amount || !payment_method) {
            return res.status(400).json({ success: false, message: "Datos incompletos" });
        }

        const safeAmount = Number(amount);

        if (Number.isNaN(safeAmount) || safeAmount <= 0) {
            return res.status(400).json({ success: false, message: "Monto invalido" });
        }

        if (!["Efectivo", "Transferencia"].includes(payment_method)) {
            return res.status(400).json({ success: false, message: "Metodo de pago invalido" });
        }

        const [chargeRows] = await db.query(
            `SELECT amount_net
             FROM payroll_charges
             WHERE id_payroll_charge = ?
             LIMIT 1`,
            [Number(id_payroll_charge)]
        );

        if (!chargeRows.length) {
            return res.status(404).json({ success: false, message: "Cargo de nomina no encontrado" });
        }

        const [paidRows] = await db.query(
            `SELECT COALESCE(SUM(amount), 0) AS paid
             FROM payroll_payments
             WHERE id_payroll_charge = ?`,
            [Number(id_payroll_charge)]
        );

        const alreadyPaid = Number(paidRows[0]?.paid || 0);
        const totalAmount = Number(chargeRows[0].amount_net || 0);
        const pending = Math.max(totalAmount - alreadyPaid, 0);

        if (safeAmount > pending) {
            return res.status(400).json({ success: false, message: "El pago supera el saldo pendiente" });
        }

        const safePaymentDate = payment_date || new Date().toISOString().slice(0, 19).replace("T", " ");

        await db.query(
            `INSERT INTO payroll_payments
            (
                id_payroll_charge,
                amount,
                payment_method,
                reference,
                notes,
                payment_date,
                created_by
            )
            VALUES (?,?,?,?,?,?,?)`,
            [
                Number(id_payroll_charge),
                safeAmount,
                payment_method,
                reference || null,
                notes || null,
                safePaymentDate,
                authUserId,
            ]
        );

        await recalculatePayrollChargeStatus(Number(id_payroll_charge));

        res.status(201).json({ success: true });
    } catch (error) {
        console.error("Error al crear pago de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.deletePayrollPayment = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        const { id } = req.params;

        const [rows] = await db.query(
            `SELECT id_payroll_charge
             FROM payroll_payments
             WHERE id_payroll_payment = ?
             LIMIT 1`,
            [Number(id)]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: "Pago no encontrado" });
        }

        const chargeId = Number(rows[0].id_payroll_charge);

        await db.query(
            `DELETE FROM payroll_payments
             WHERE id_payroll_payment = ?`,
            [Number(id)]
        );

        await recalculatePayrollChargeStatus(chargeId);

        res.json({ success: true });
    } catch (error) {
        console.error("Error al eliminar pago de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};

exports.getPayrollDashboardSummary = async (req, res) => {
    try {
        if (!(await ensureAdmin(req, res))) return;

        await generatePendingPayrollCharges();

        const [rows] = await db.query(
            `SELECT
                pc.id_payroll_charge,
                pc.id_payroll_employee,
                u.name AS employee_name,
                pc.due_date,
                pc.amount_net,
                COALESCE(SUM(pp.amount), 0) AS paid_amount,
                GREATEST(pc.amount_net - COALESCE(SUM(pp.amount), 0), 0) AS pending_amount
             FROM payroll_charges pc
             INNER JOIN payroll_employees pe
                ON pe.id_payroll_employee = pc.id_payroll_employee
             INNER JOIN users u
                ON u.id = pe.id_user
             LEFT JOIN payroll_payments pp
                ON pp.id_payroll_charge = pc.id_payroll_charge
             WHERE pe.is_active = 1
             GROUP BY
                pc.id_payroll_charge,
                pc.id_payroll_employee,
                u.name,
                pc.due_date,
                pc.amount_net
             HAVING pending_amount > 0
             ORDER BY pc.due_date ASC, pc.id_payroll_charge ASC`
        );

        let globalPending = 0;
        const pendingByEmployeeMap = new Map();

        for (const row of rows) {
            const pendingAmount = Number(row.pending_amount || 0);
            globalPending += pendingAmount;

            const key = Number(row.id_payroll_employee);
            const current = pendingByEmployeeMap.get(key) || {
                id_payroll_employee: key,
                employee_name: row.employee_name,
                pending_amount: 0,
                pending_charges: 0,
                next_due_date: row.due_date,
            };

            current.pending_amount += pendingAmount;
            current.pending_charges += 1;

            if (!current.next_due_date || String(row.due_date) < String(current.next_due_date)) {
                current.next_due_date = row.due_date;
            }

            pendingByEmployeeMap.set(key, current);
        }

        const pendingByEmployee = Array.from(pendingByEmployeeMap.values()).sort(
            (a, b) => Number(b.pending_amount) - Number(a.pending_amount)
        );

        res.json({
            success: true,
            data: {
                global_pending_amount: globalPending,
                pending_charges_count: rows.length,
                pending_by_employee: pendingByEmployee,
            },
        });
    } catch (error) {
        console.error("Error al obtener resumen de nomina:", error);
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
};
