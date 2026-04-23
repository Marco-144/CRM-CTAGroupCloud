const db = require("../config/db");

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function parseDateOnly(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const rawValue = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
        const [year, month, day] = rawValue.slice(0, 10).split("-").map(Number);
        if (year && month && day) {
            return new Date(year, month - 1, day);
        }
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(rawValue)) {
        const [day, month, year] = rawValue.split("/").map(Number);
        if (year && month && day) {
            return new Date(year, month - 1, day);
        }
    }

    const fallbackDate = new Date(rawValue);
    if (Number.isNaN(fallbackDate.getTime())) {
        return null;
    }

    return new Date(
        fallbackDate.getFullYear(),
        fallbackDate.getMonth(),
        fallbackDate.getDate()
    );
}

function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

function getLastDayOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isLastDayOfMonth(date) {
    return date.getDate() === getLastDayOfMonth(date).getDate();
}

function isDueDate(date, payFrequency) {
    if (payFrequency === "Semanal") {
        return date.getDay() === 6;
    }

    if (payFrequency === "Quincenal") {
        return date.getDate() === 15 || isLastDayOfMonth(date);
    }

    if (payFrequency === "Mensual") {
        return isLastDayOfMonth(date);
    }

    return false;
}

function getChargePeriodBounds(dueDate, payFrequency) {
    if (payFrequency === "Semanal") {
        const periodEnd = new Date(dueDate);
        const periodStart = addDays(periodEnd, -6);
        return {
            periodStart: formatDateOnly(periodStart),
            periodEnd: formatDateOnly(periodEnd),
        };
    }

    if (payFrequency === "Quincenal") {
        const day = dueDate.getDate();
        const year = dueDate.getFullYear();
        const month = dueDate.getMonth();

        if (day <= 15) {
            return {
                periodStart: formatDateOnly(new Date(year, month, 1)),
                periodEnd: formatDateOnly(new Date(year, month, 15)),
            };
        }

        return {
            periodStart: formatDateOnly(new Date(year, month, 16)),
            periodEnd: formatDateOnly(getLastDayOfMonth(dueDate)),
        };
    }

    const year = dueDate.getFullYear();
    const month = dueDate.getMonth();
    return {
        periodStart: formatDateOnly(new Date(year, month, 1)),
        periodEnd: formatDateOnly(getLastDayOfMonth(dueDate)),
    };
}

async function isAdminUser(userId) {
    const safeUserId = Number(userId || 0);
    if (!safeUserId) return false;

    const [rows] = await db.query(
        `SELECT
            COALESCE(d.name, '') AS department_name,
            COALESCE(r.name, '') AS role_name
         FROM users u
         LEFT JOIN departments d ON d.id_department = u.id_department
         LEFT JOIN roles r ON r.id_role = u.id_role
         WHERE u.id = ?
         LIMIT 1`,
        [safeUserId]
    );

    if (!rows.length) return false;

    const department = normalizeText(rows[0].department_name);
    const role = normalizeText(rows[0].role_name);

    return department.includes("administrador") || role.includes("administrador");
}

async function generatePendingPayrollCharges() {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [employees] = await connection.query(
            `SELECT
                pe.id_payroll_employee,
                pe.salary_net,
                pe.pay_frequency,
                pe.start_date,
                MAX(pc.due_date) AS last_due_date
             FROM payroll_employees pe
             LEFT JOIN payroll_charges pc
                ON pc.id_payroll_employee = pe.id_payroll_employee
             WHERE pe.is_active = 1
             GROUP BY
                pe.id_payroll_employee,
                pe.salary_net,
                pe.pay_frequency,
                pe.start_date`
        );

        const today = new Date();
        const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        for (const employee of employees) {
            const employeeStartDate = parseDateOnly(employee.start_date);
            const parsedLastDueDate = parseDateOnly(employee.last_due_date);

            const startFrom = parsedLastDueDate
                ? addDays(parsedLastDueDate, 1)
                : employeeStartDate;

            if (!startFrom || !employeeStartDate) {
                continue;
            }

            let cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), startFrom.getDate());

            while (cursor <= todayDate) {
                if (isDueDate(cursor, employee.pay_frequency)) {
                    const dueDate = formatDateOnly(cursor);
                    const { periodStart, periodEnd } = getChargePeriodBounds(cursor, employee.pay_frequency);
                    const periodStartDate = parseDateOnly(periodStart);

                    // Evita generar cargos de periodos parciales previos al inicio del empleado.
                    if (periodStartDate && periodStartDate < employeeStartDate) {
                        cursor = addDays(cursor, 1);
                        continue;
                    }

                    await connection.query(
                        `INSERT IGNORE INTO payroll_charges
                        (
                            id_payroll_employee,
                            due_date,
                            period_start,
                            period_end,
                            amount_net,
                            pay_frequency_snapshot,
                            status
                        )
                        VALUES (?,?,?,?,?,?, 'Pendiente')`,
                        [
                            employee.id_payroll_employee,
                            dueDate,
                            periodStart,
                            periodEnd,
                            employee.salary_net,
                            employee.pay_frequency,
                        ]
                    );
                }

                cursor = addDays(cursor, 1);
            }
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function recalculatePayrollChargeStatus(chargeId) {
    const safeChargeId = Number(chargeId || 0);
    if (!safeChargeId) return;

    const [rows] = await db.query(
        `SELECT
            c.id_payroll_charge,
            c.amount_net,
            COALESCE(SUM(p.amount), 0) AS paid_amount
         FROM payroll_charges c
         LEFT JOIN payroll_payments p
            ON p.id_payroll_charge = c.id_payroll_charge
         WHERE c.id_payroll_charge = ?
         GROUP BY c.id_payroll_charge, c.amount_net`,
        [safeChargeId]
    );

    if (!rows.length) return;

    const amount = Number(rows[0].amount_net || 0);
    const paid = Number(rows[0].paid_amount || 0);

    let status = "Pendiente";

    if (paid >= amount && amount > 0) {
        status = "Pagado";
    } else if (paid > 0) {
        status = "Pagado Parcial";
    }

    await db.query(
        `UPDATE payroll_charges
         SET status = ?
         WHERE id_payroll_charge = ?`,
        [status, safeChargeId]
    );
}

module.exports = {
    isAdminUser,
    generatePendingPayrollCharges,
    recalculatePayrollChargeStatus,
};
