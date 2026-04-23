async function loadDashboardKpis() {
    try {
        const userData = JSON.parse(sessionStorage.getItem("loggedUserData") || "{}");
        const isAdmin = isAdminUser(userData);

        // Cargar ventas
        const salesRes = await apiFetch("/api/sales");
        const salesPayload = await salesRes.json();

        if (salesPayload.success) {
            const sales = salesPayload.data || [];

            // Total de ventas activas y suma de ventas del mes en curso.
            let totalVentas = 0;
            let ventasMes = 0;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            sales.forEach(sale => {
                const amount = Number(sale.total || 0);
                const saleStatus = String(sale.sale_status || "").trim().toLowerCase();
                const saleDate = new Date(sale.sale_date);

                if (saleStatus === "activa") {
                    totalVentas += amount;
                }

                if (
                    !Number.isNaN(saleDate.getTime()) &&
                    saleDate.getMonth() === currentMonth &&
                    saleDate.getFullYear() === currentYear
                ) {
                    ventasMes += amount;
                }
            });

            const totalVentasElement = document.getElementById("kpiTotalVentas");
            const ventasMesElement = document.getElementById("kpiVentasMes");

            if (totalVentasElement) {
                totalVentasElement.textContent = formatMoney(totalVentas);
            }

            if (ventasMesElement) {
                ventasMesElement.textContent = formatMoney(ventasMes);
            }
        }

        if (isAdmin) {
            await loadPayrollDashboardSummary();
            await loadRecurringSalesSummary();
        }

    } catch (error) {
        console.error("Error cargando KPIs:", error);
    }
}

async function loadRecurringSalesSummary() {
    const response = await apiFetch("/api/sales/recurring-summary");
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "No se pudo cargar resumen de cobros mensuales");
    }

    const data = payload.data || {};
    const pendingItems = data.pending_items || [];

    const kpiRecurringCard = document.getElementById("kpiRecurringCard");
    const kpiRecurringPendiente = document.getElementById("kpiRecurringPendiente");
    const recurringAlertsCard = document.getElementById("recurringAlertsCard");
    const recurringAlertsList = document.getElementById("recurringAlertsList");

    if (kpiRecurringCard) {
        kpiRecurringCard.style.display = "block";
    }

    if (kpiRecurringPendiente) {
        kpiRecurringPendiente.textContent = formatMoney(data.monthly_pending_amount || 0);
    }

    if (recurringAlertsCard) {
        recurringAlertsCard.style.display = "block";
    }

    if (!recurringAlertsList) return;

    if (!pendingItems.length) {
        recurringAlertsList.innerHTML = '<div class="text-muted">No hay cobros mensuales pendientes en este mes.</div>';
        return;
    }

    recurringAlertsList.innerHTML = pendingItems.map((item) => {
        return `
            <div class="d-flex justify-content-between align-items-start border rounded-3 p-3">
                <div>
                    <div class="fw-semibold">${escapeHTML(item.company || "Cliente")}</div>
                    <small class="text-muted">Venta: ${escapeHTML(item.sale_folio || "-")} | Mes: ${formatDate(item.charge_month)}</small>
                </div>
                <div class="fw-bold text-info">${formatMoney(item.pending_amount)}</div>
            </div>
        `;
    }).join("");
}

async function loadPayrollDashboardSummary() {
    const response = await apiFetch("/api/payroll/dashboard-summary");
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
        throw new Error(payload.message || "No se pudo cargar resumen de nomina");
    }

    const data = payload.data || {};
    const pendingByEmployee = data.pending_by_employee || [];

    const kpiNominaCard = document.getElementById("kpiNominaCard");
    const kpiNominaPendiente = document.getElementById("kpiNominaPendiente");
    const nominaAlertsCard = document.getElementById("nominaAlertsCard");
    const nominaAlertsList = document.getElementById("nominaAlertsList");

    if (kpiNominaCard) {
        kpiNominaCard.style.display = "block";
    }

    if (kpiNominaPendiente) {
        kpiNominaPendiente.textContent = formatMoney(data.global_pending_amount || 0);
    }

    if (nominaAlertsCard) {
        nominaAlertsCard.style.display = "block";
    }

    if (!nominaAlertsList) return;

    if (!pendingByEmployee.length) {
        nominaAlertsList.innerHTML = '<div class="text-muted">No hay adeudos de nomina pendientes.</div>';
        return;
    }

    nominaAlertsList.innerHTML = pendingByEmployee.map((item) => {
        return `
            <div class="d-flex justify-content-between align-items-start border rounded-3 p-3">
                <div>
                    <div class="fw-semibold">${escapeHTML(item.employee_name || "Empleado")}</div>
                    <small class="text-muted">Pendientes: ${Number(item.pending_charges || 0)} | Proximo vencimiento: ${formatDate(item.next_due_date)}</small>
                </div>
                <div class="fw-bold text-danger">${formatMoney(item.pending_amount)}</div>
            </div>
        `;
    }).join("");
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function isAdminUser(userData) {
    const department = normalizeText(userData.department);
    const role = normalizeText(userData.role);
    return department.includes("administrador") || role.includes("administrador");
}

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("es-MX");
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatMoney(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(value || 0);
}

loadDashboardKpis();
