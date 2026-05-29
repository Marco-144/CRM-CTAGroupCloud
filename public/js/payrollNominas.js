(() => {
    const tableBody = document.getElementById("payrollChargesTableBody");
    const historyBody = document.getElementById("payrollPaymentHistoryBody");

    const employeeFilter = document.getElementById("payrollChargesEmployeeFilter");
    const statusFilter = document.getElementById("payrollChargesStatusFilter");
    const monthFilter = document.getElementById("payrollChargesMonthFilter");
    const dateFromFilter = document.getElementById("payrollChargesDateFromFilter");
    const dateToFilter = document.getElementById("payrollChargesDateToFilter");
    const filtersToggleBtn = document.getElementById("payrollFiltersToggleBtn");
    const filtersPanel = document.getElementById("payrollFiltersPanel");
    const refreshBtn = document.getElementById("refreshPayrollChargesBtn");

    const globalPendingKpi = document.getElementById("payrollGlobalPendingKpi");
    const pendingChargesKpi = document.getElementById("payrollPendingChargesKpi");

    const paymentForm = document.getElementById("payrollPaymentForm");
    const paymentChargeId = document.getElementById("payrollPaymentChargeId");
    const paymentChargeInfo = document.getElementById("payrollPaymentChargeInfo");
    const paymentAmount = document.getElementById("payrollPaymentAmount");
    const paymentMethod = document.getElementById("payrollPaymentMethod");
    const paymentReference = document.getElementById("payrollPaymentReference");
    const paymentNotes = document.getElementById("payrollPaymentNotes");

    const paymentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("payrollPaymentModal"));
    const historyModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("payrollPaymentHistoryModal"));

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let chargesCache = [];
    let employeesCache = [];
    let historyChargeId = null;
    let currentPage = 1;
    const TABLE_PAGE_SIZE = 7;
    const CARD_PAGE_SIZE = 5;
    const paginationContainer = ensurePaginationContainer(tableBody, "payrollChargesPagination");

    function isMobileVerticalView() {
        return window.innerWidth <= 768 && window.innerHeight > window.innerWidth;
    }

    function getCurrentPageSize() {
        return isMobileVerticalView() ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
    }

    function ensurePaginationContainer(tableElement, containerId) {
        let container = document.getElementById(containerId);

        if (!container && tableElement) {
            container = document.createElement("div");
            container.id = containerId;
            container.className = "d-flex justify-content-end align-items-center gap-2 mt-3";

            const tableWrapper = tableElement.closest(".table-responsive") || tableElement.parentElement;
            tableWrapper?.insertAdjacentElement("afterend", container);
        }

        return container;
    }

    function renderPagination(totalItems, rowsToRender) {
        if (!paginationContainer) return;

        const pageSize = getCurrentPageSize();
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

        if (totalItems <= pageSize) {
            paginationContainer.innerHTML = "";
            return;
        }

        const prevDisabled = currentPage <= 1 ? "disabled" : "";
        const nextDisabled = currentPage >= totalPages ? "disabled" : "";

        paginationContainer.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary btn-anterior" ${prevDisabled} data-page-action="prev">Anterior</button>
            <span class="small text-muted">Página ${currentPage} de ${totalPages}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary btn-siguiente" ${nextDisabled} data-page-action="next">Siguiente</button>
        `;

        paginationContainer.querySelector('[data-page-action="prev"]')?.addEventListener("click", () => {
            if (currentPage > 1) {
                currentPage -= 1;
                renderCharges(rowsToRender);
            }
        });

        paginationContainer.querySelector('[data-page-action="next"]')?.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage += 1;
                renderCharges(rowsToRender);
            }
        });
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatMoney(value, currency = "MXN") {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
        }).format(Number(value || 0));
    }

    function formatDate(value) {
        if (!value) return "-";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("es-MX");
    }

    function formatDateTime(value) {
        if (!value) return "-";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleString("es-MX");
    }

    function renderEmployeeFilter() {
        employeeFilter.innerHTML = '<option value="">Todos</option>';

        employeesCache.forEach((item) => {
            const option = document.createElement("option");
            option.value = String(item.id_payroll_employee);
            option.textContent = item.employee_name || item.username || "-";
            employeeFilter.appendChild(option);
        });
    }

    function statusBadge(status) {
        if (status === "Pagado") {
            return '<span class="badge text-bg-success">Pagado</span>';
        }
        if (status === "Pagado Parcial") {
            return '<span class="badge text-bg-warning">Pagado Parcial</span>';
        }
        return '<span class="badge text-bg-danger">Pendiente</span>';
    }

    function toDateKey(value) {
        if (!value) return "";
        const text = String(value).trim();
        if (!text) return "";

        if (text.length >= 10 && text.includes("-")) {
            return text.slice(0, 10);
        }

        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) {
            return "";
        }

        return parsed.toISOString().slice(0, 10);
    }

    function getMonthBounds(monthValue) {
        if (!monthValue) return null;

        const [year, month] = String(monthValue).split("-").map(Number);
        if (!year || !month) return null;

        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0);
        return { start, end };
    }

    function applyChargeFilters() {
        const employeeId = Number(employeeFilter?.value || 0);
        const status = String(statusFilter?.value || "").trim();
        const monthBounds = getMonthBounds(monthFilter?.value || "");
        const dateFromKey = toDateKey(dateFromFilter?.value || "");
        const dateToKey = toDateKey(dateToFilter?.value || "");

        return chargesCache.filter((item) => {
            if (employeeId && Number(item.id_payroll_employee) !== employeeId) {
                return false;
            }

            if (status && String(item.status || "") !== status) {
                return false;
            }

            const dueDateKey = toDateKey(item.due_date);

            if (monthBounds && dueDateKey) {
                const { start, end } = monthBounds;
                const dueDate = new Date(`${dueDateKey}T00:00:00`);
                if (dueDate < start || dueDate > end) {
                    return false;
                }
            }

            if (dateFromKey && dueDateKey && dueDateKey < dateFromKey) {
                return false;
            }

            if (dateToKey && dueDateKey && dueDateKey > dateToKey) {
                return false;
            }

            return true;
        });
    }

    function applyFilters() {
        currentPage = 1;
        const filteredRows = applyChargeFilters();
        renderCharges(filteredRows);
        updateKpis(filteredRows);
    }

    function clearFilters() {
        if (employeeFilter) employeeFilter.value = "";
        if (statusFilter) statusFilter.value = "";
        if (monthFilter) monthFilter.value = "";
        if (dateFromFilter) dateFromFilter.value = "";
        if (dateToFilter) dateToFilter.value = "";
        applyFilters();
    }

    function setFiltersPanelVisible(visible) {
        if (!filtersPanel || !filtersToggleBtn) return;

        filtersPanel.classList.toggle("d-none", !visible);
        filtersPanel.setAttribute("aria-hidden", visible ? "false" : "true");
        filtersToggleBtn.setAttribute("aria-expanded", visible ? "true" : "false");
    }

    function toggleFiltersPanel() {
        if (!filtersPanel) return;
        setFiltersPanelVisible(filtersPanel.classList.contains("d-none"));
    }

    function renderCharges(rows) {
        if (!rows.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay cargos para mostrar.</td></tr>';
            renderPagination(0, rows);
            return;
        }

        const pageSize = getCurrentPageSize();
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * pageSize;
        const paginatedRows = rows.slice(start, start + pageSize);

        tableBody.innerHTML = paginatedRows.map((item) => {
            const period = `${formatDate(item.period_start)} - ${formatDate(item.period_end)}`;
            const canPay = Number(item.pending_amount || 0) > 0;

            return `
                <tr>
                    <td data-label="Empleado">${escapeHTML(item.employee_name || "-")}</td>
                    <td data-label="Vencimiento">${formatDate(item.due_date)}</td>
                    <td data-label="Periodo">${period}</td>
                    <td data-label="Monto">${formatMoney(item.amount_net)}</td>
                    <td data-label="Pagado">${formatMoney(item.paid_amount)}</td>
                    <td data-label="Pendiente">${formatMoney(item.pending_amount)}</td>
                    <td data-label="Estatus">${statusBadge(item.status)}</td>
                    <td class="text-end" data-label="Acciones">
                        <button class="btn btn-sm btn-outline-primary me-2 show-payroll-history" data-id="${item.id_payroll_charge}">
                            <i class="bi bi-clock-history"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-success register-payroll-payment" data-id="${item.id_payroll_charge}" ${canPay ? "" : "disabled"}>
                            <i class="bi bi-cash-coin"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

        renderPagination(rows.length, rows);
    }

    function updateKpis(data = chargesCache) {
        const pendingAmount = data.reduce((acc, item) => acc + Number(item.pending_amount || 0), 0);
        const pendingCount = data.filter((item) => Number(item.pending_amount || 0) > 0).length;

        globalPendingKpi.textContent = formatMoney(pendingAmount);
        pendingChargesKpi.textContent = String(pendingCount);
    }

    async function fetchEmployees() {
        const response = await apiFetch("/api/payroll/employees");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudieron cargar los empleados");
        }

        employeesCache = payload.data || [];
        renderEmployeeFilter();
    }

    async function fetchCharges() {
        currentPage = 1;
        const params = new URLSearchParams();

        if (employeeFilter.value) {
            params.set("employeeId", employeeFilter.value);
        }

        if (statusFilter.value) {
            params.set("status", statusFilter.value);
        }

        const query = params.toString();
        const endpoint = query ? `/api/payroll/charges?${query}` : "/api/payroll/charges";

        const response = await apiFetch(endpoint);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudieron cargar los cargos de nomina");
        }

        chargesCache = payload.data || [];
        applyFilters();
    }

    function openPaymentModal(chargeId) {
        const selected = chargesCache.find((item) => Number(item.id_payroll_charge) === Number(chargeId));
        if (!selected) return;

        paymentForm.reset();
        paymentChargeId.value = String(selected.id_payroll_charge);
        paymentAmount.value = Number(selected.pending_amount || 0);
        paymentChargeInfo.textContent = `${selected.employee_name || "Empleado"} | Pendiente: ${formatMoney(selected.pending_amount)}`;

        paymentModal.show();
    }

    async function savePayment(event) {
        event.preventDefault();

        const payload = {
            id_payroll_charge: Number(paymentChargeId.value),
            amount: Number(paymentAmount.value),
            payment_method: paymentMethod.value,
            reference: paymentReference.value.trim() || null,
            notes: paymentNotes.value.trim() || null,
        };

        const response = await apiFetch("/api/payroll/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            throw new Error(result.message || "No se pudo registrar el pago");
        }

        paymentModal.hide();
        await fetchCharges();

        if (historyChargeId && Number(historyChargeId) === Number(payload.id_payroll_charge)) {
            await fetchPaymentHistory(historyChargeId);
        }
    }

    async function fetchPaymentHistory(chargeId) {
        historyChargeId = Number(chargeId);

        const response = await apiFetch(`/api/payroll/charges/${chargeId}/payments`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudo cargar el historial de pagos");
        }

        const rows = payload.data || [];

        if (!rows.length) {
            historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sin pagos registrados.</td></tr>';
            return;
        }

        historyBody.innerHTML = rows.map((item) => `
            <tr>
                <td>${formatDateTime(item.payment_date)}</td>
                <td>${formatMoney(item.amount)}</td>
                <td>${escapeHTML(item.payment_method || "-")}</td>
                <td>${escapeHTML(item.reference || "-")}</td>
                <td>${escapeHTML(item.notes || "-")}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-danger delete-payroll-payment" data-id="${item.id_payroll_payment}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `).join("");
    }

    async function removePayment(paymentId) {
        const confirmed = await showConfirm("¿Deseas eliminar este pago?");
        if (!confirmed) return;

        const response = await apiFetch(`/api/payroll/payments/${paymentId}`, {
            method: "DELETE",
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudo eliminar el pago");
        }

        if (historyChargeId) {
            await fetchPaymentHistory(historyChargeId);
        }

        await fetchCharges();
    }

    if (!tableBody || !paymentForm || !historyBody) return;

    filtersToggleBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFiltersPanel();
    });

    filtersPanel?.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", (event) => {
        if (!filtersPanel || filtersPanel.classList.contains("d-none")) {
            return;
        }

        const clickedInside = filtersPanel.contains(event.target) || filtersToggleBtn?.contains(event.target);
        if (!clickedInside) {
            setFiltersPanelVisible(false);
        }
    });

    employeeFilter?.addEventListener("change", () => {
        applyFilters();
    });

    statusFilter?.addEventListener("change", () => {
        applyFilters();
    });

    monthFilter?.addEventListener("change", () => {
        applyFilters();
    });

    dateFromFilter?.addEventListener("change", () => {
        applyFilters();
    });

    dateToFilter?.addEventListener("change", () => {
        applyFilters();
    });

    refreshBtn?.addEventListener("click", () => {
        fetchCharges().catch((error) => showAlert(error.message));
    });

    paymentForm.addEventListener("submit", async (event) => {
        try {
            await savePayment(event);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    tableBody.addEventListener("click", async (event) => {
        const historyBtn = event.target.closest(".show-payroll-history");
        if (historyBtn) {
            try {
                await fetchPaymentHistory(historyBtn.dataset.id);
                historyModal.show();
            } catch (error) {
                await showAlert(error.message);
            }
            return;
        }

        const payBtn = event.target.closest(".register-payroll-payment");
        if (payBtn) {
            openPaymentModal(payBtn.dataset.id);
        }
    });

    historyBody.addEventListener("click", async (event) => {
        const deleteBtn = event.target.closest(".delete-payroll-payment");
        if (!deleteBtn) return;

        try {
            await removePayment(deleteBtn.dataset.id);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    Promise.all([fetchEmployees(), fetchCharges()]).catch((error) => {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${escapeHTML(error.message)}</td></tr>`;
    });

    setFiltersPanelVisible(false);

    window.addEventListener("app:resize", () => {
        applyFilters();
    });

    window.addEventListener("resize", () => {
        applyFilters();
    });

    window.addEventListener("orientationchange", () => {
        setTimeout(() => applyFilters(), 200);
    });
})();
