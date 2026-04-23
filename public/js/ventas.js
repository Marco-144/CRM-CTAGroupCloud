(() => {
    // Vista de ventas: listado, búsqueda, detalle, pagos y cambios de estatus.
    const table = document.getElementById("salesTable");
    const cards = document.getElementById("salesCards");
    const searchInput = document.getElementById("salesSearch");
    const detailBody = document.getElementById("saleDetailBody");

    const detailModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("saleDetailModal"));
    const paymentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("addPaymentModal"));

    const paymentForm = document.getElementById("paymentForm");
    const paymentId = document.getElementById("paymentId");
    const paymentSaleId = document.getElementById("paymentSaleId");
    const paymentAmount = document.getElementById("paymentAmount");
    const paymentMethod = document.getElementById("paymentMethod");
    const paymentApplyTo = document.getElementById("paymentApplyTo");
    const paymentReference = document.getElementById("paymentReference");
    const paymentNotes = document.getElementById("paymentNotes");
    const paymentRecurringTargetInfo = document.getElementById("paymentRecurringTargetInfo");
    const paymentQuoteReferenceInfo = document.getElementById("paymentQuoteReferenceInfo");
    const paymentQuoteItemsBody = document.getElementById("paymentQuoteItemsBody");
    const paymentModalTitle = document.getElementById("paymentModalTitle");
    const paymentSubmitButton = paymentForm?.querySelector('button[type="submit"]');
    const recurringBoardTable = document.getElementById("recurringBoardTable");
    const recurringBoardMonth = document.getElementById("recurringBoardMonth");
    const recurringBoardPendingCount = document.getElementById("recurringBoardPendingCount");
    const recurringBoardPaidCount = document.getElementById("recurringBoardPaidCount");
    const recurringBoardPendingAmount = document.getElementById("recurringBoardPendingAmount");
    const recurringBoardPaidAmount = document.getElementById("recurringBoardPaidAmount");
    const recurringBoardPagination = document.getElementById("recurringBoardPagination");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));
    const GLOBAL_IVA_RATE = 0.16;

    let salesCache = [];
    let currentSaleId = null;
    let currentPaymentsById = new Map();
    let paymentContextBySaleId = new Map();
    let selectedRecurringChargeId = null;
    let recurringBoardCache = [];
    let recurringBoardCurrentPage = 1;
    const TABLE_PAGE_SIZE = 7;
    const CARD_PAGE_SIZE = 5;
    const RECURRING_BOARD_PAGE_SIZE = 8;
    let currentPage = 1;
    const paginationContainer = ensurePaginationContainer(table, "salesPagination");

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
                renderTable(rowsToRender);
            }
        });

        paginationContainer.querySelector('[data-page-action="next"]')?.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage += 1;
                renderTable(rowsToRender);
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

    function renderCards(rows) {
        if (!cards) return;

        cards.innerHTML = rows.map((sale) => `
            <div class="sale-card">
                <div class="sale-card-title">${escapeHTML(sale.sale_folio || "-")}</div>
                <div class="sale-card-meta">Empresa: ${escapeHTML(sale.company || "-")}</div>
                <div class="sale-card-meta">Fecha: ${formatDate(sale.sale_date)}</div>
                <div class="sale-card-meta">Total: ${formatMoney(sale.total)}</div>
                <div class="sale-card-meta">Pendiente base: ${formatMoney(sale.pending_amount)}</div>
                <div class="sale-card-meta">Mensual actual: ${formatMoney(sale.recurring_current_month_pending_amount)}</div>
                <div class="sale-card-meta">Pago: ${escapeHTML(sale.payment_status || "Pendiente")}</div>
                <div class="sale-card-meta">Estatus: ${escapeHTML(sale.sale_status || "Activa")}</div>
                <div class="sale-card-actions mt-2">
                    <button class="btn btn-sm btn-outline-primary detail-sale" data-id="${sale.id_sale}">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success add-payment" data-id="${sale.id_sale}">
                        <i class="bi bi-cash-coin"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary toggle-status" data-id="${sale.id_sale}">
                        <i class="bi bi-arrow-repeat"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-sale" data-id="${sale.id_sale}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join("");
    }


    /* ============================
    KPIs
    ============================ */
    function updateKpis(data = salesCache) {

        const total = data.reduce(
            (acc, item) => acc + Number(item.total || 0),
            0
        );

        const pendiente = data.reduce(
            (acc, item) => acc + Number(item.pending_amount || 0),
            0
        );

        totalVentas.textContent = data.length;
        sumTotalVentas.textContent = formatMoney(total);
        sumPendienteVentas.textContent = formatMoney(pendiente);
    }

    function formatDate(value) {
        if (!value) return "-";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("es-MX");
    }

    function formatMoney(value, currency = "MXN") {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
        }).format(Number(value || 0));
    }

    function renderTable(rows) {
        const useCards = isMobileVerticalView();
        const pageSize = getCurrentPageSize();

        if (cards) {
            cards.style.display = useCards ? "block" : "none";
        }

        if (!rows.length) {
            table.innerHTML = `
			<tr>
                <td colspan="8" class="text-center text-muted py-4">No hay ventas registradas</td>
			</tr>
		`;
            if (cards) {
                cards.innerHTML = `<div class="text-center text-muted py-4">No hay ventas registradas</div>`;
            }
            renderPagination(0, rows);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * pageSize;
        const paginatedRows = rows.slice(start, start + pageSize);

        if (useCards) {
            table.innerHTML = "";
            renderCards(paginatedRows);
            renderPagination(rows.length, rows);
            return;
        }

        table.innerHTML = paginatedRows.map((sale) => `
		<tr>
			<td>${escapeHTML(sale.sale_folio || "-")}</td>
			<td>${escapeHTML(sale.company || "-")}</td>
			<td>${formatDate(sale.sale_date)}</td>
			<td>${formatMoney(sale.total)}</td>
            <td>
                <div>${formatMoney(sale.pending_amount)}</div>
                <small class="text-muted d-block">Mensual: ${formatMoney(sale.recurring_current_month_pending_amount)}</small>
            </td>
			<td>${escapeHTML(sale.payment_status || "Pendiente")}</td>
			<td>${escapeHTML(sale.sale_status || "Activa")}</td>
            <td class="text-end">
                <div class="table-sale-actions">
                    <button class="btn btn-sm btn-outline-primary detail-sale" data-id="${sale.id_sale}">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-success add-payment" data-id="${sale.id_sale}">
                        <i class="bi bi-cash-coin"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary toggle-status" data-id="${sale.id_sale}">
                        <i class="bi bi-arrow-repeat"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-sale" data-id="${sale.id_sale}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
			</td>
		</tr>
	`).join("");

        renderPagination(rows.length, rows);
    }

    function applySearch() {
        currentPage = 1;
        const q = (searchInput.value || "").trim().toLowerCase();
        if (!q) {
            renderTable(salesCache);
            return;
        }

        const filtered = salesCache.filter((sale) => {
            const folio = String(sale.sale_folio || "").toLowerCase();
            const company = String(sale.company || "").toLowerCase();
            return folio.includes(q) || company.includes(q);
        });

        renderTable(filtered);
        updateKpis(filtered);
    }

    async function loadSales() {
        const response = await apiFetch("/api/sales");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudieron cargar las ventas");
        }

        salesCache = payload.data || [];
        currentPage = 1;
        applySearch();
        updateKpis();
        loadRecurringBoard().catch((error) => console.error("Error cargando tablero mensual:", error));
    }

    function renderPaymentsTable(payments) {
        if (!payments.length) {
            return `<tr><td colspan="7" class="text-center text-muted">Sin pagos registrados</td></tr>`;
        }

        return payments.map((item) => `
		<tr>
			<td>${formatDate(item.payment_date)}</td>
            <td>${escapeHTML(formatMonthLabel(item.charge_month))}</td>
			<td>${formatMoney(item.amount, item.currency || "MXN")}</td>
			<td>${escapeHTML(item.payment_method || "-")}</td>
			<td>${escapeHTML(item.reference || "-")}</td>
			<td>${escapeHTML(item.notes || "-")}</td>
            <td class="text-end">
                <div class="d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-sm btn-outline-primary edit-payment" data-payment-id="${item.id_payment}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-danger delete-payment" data-payment-id="${item.id_payment}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
		</tr>
	`).join("");
    }

    function renderQuoteItemsTable(items) {
        if (!items.length) {
            return `<tr><td colspan="5" class="text-center text-muted">Sin conceptos de cotizacion</td></tr>`;
        }

        return items.map((item) => `
		<tr>
			<td>${escapeHTML(item.descripcion || "-")}</td>
			<td>${escapeHTML(item.periodicidad || "-")}</td>
			<td>${escapeHTML(item.cantidad || "-")}</td>
			<td>${formatMoney(item.costo_unitario)}</td>
			<td>${formatMoney(item.line_total)}</td>
		</tr>
	`).join("");
    }

    function buildQuoteReference(sale, quoteItems) {
        const quoteFolio = sale?.quote_folio ? `COT-${sale.quote_folio}` : "Cotizacion";
        const items = Array.isArray(quoteItems) ? quoteItems : [];

        if (!items.length) {
            return quoteFolio;
        }

        const conciseItems = items
            .slice(0, 2)
            .map((item) => String(item.descripcion || "").trim())
            .filter(Boolean)
            .map((text) => text.length > 28 ? `${text.slice(0, 28)}...` : text);

        const suffix = conciseItems.length ? ` | ${conciseItems.join("; ")}` : "";
        return `${quoteFolio}${suffix}`.slice(0, 100);
    }

    function renderQuoteItemsInPaymentModal(items) {
        if (!paymentQuoteItemsBody) return;

        if (!Array.isArray(items) || !items.length) {
            paymentQuoteItemsBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">Sin conceptos de cotizacion</td>
                </tr>
            `;
            return;
        }

        paymentQuoteItemsBody.innerHTML = renderQuoteItemsTable(items);
    }

    function formatMonthLabel(value) {
        if (!value) return "-";

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "-";

        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        return `${month}/${year}`;
    }

    function renderRecurringChargesTable(charges) {
        if (!Array.isArray(charges) || !charges.length) {
            return `
                <tr>
                    <td colspan="5" class="text-center text-muted">Sin cobros mensuales recurrentes</td>
                </tr>
            `;
        }

        return charges.map((charge) => {
            const status = String(charge.status || "Pendiente");
            let badgeClass = "bg-secondary";

            if (status === "Pagado") {
                badgeClass = "bg-success";
            } else if (status === "Pagado Parcial") {
                badgeClass = "bg-warning text-dark";
            }

            return `
                <tr>
                    <td>${escapeHTML(formatMonthLabel(charge.charge_month))}</td>
                    <td>${formatMoney(charge.amount)}</td>
                    <td>${formatMoney(charge.paid_amount)}</td>
                    <td>${formatMoney(charge.pending_amount)}</td>
                    <td><span class="badge ${badgeClass}">${escapeHTML(status)}</span></td>
                </tr>
            `;
        }).join("");
    }

    function renderRecurringBoardTable(items) {
        if (!recurringBoardTable) return;

        if (!Array.isArray(items) || !items.length) {
            recurringBoardTable.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center text-muted py-4">Sin cobros mensuales registrados</td>
                </tr>
            `;
            if (recurringBoardPagination) {
                recurringBoardPagination.innerHTML = "";
            }
            return;
        }

        const totalPages = Math.max(1, Math.ceil(items.length / RECURRING_BOARD_PAGE_SIZE));
        if (recurringBoardCurrentPage > totalPages) {
            recurringBoardCurrentPage = totalPages;
        }

        const start = (recurringBoardCurrentPage - 1) * RECURRING_BOARD_PAGE_SIZE;
        const paginatedItems = items.slice(start, start + RECURRING_BOARD_PAGE_SIZE);

        recurringBoardTable.innerHTML = paginatedItems.map((item) => {
            const status = String(item.status || "Pendiente");
            let badgeClass = "bg-secondary";
            const isAmountWithIva = Number(item.is_amount_with_iva ?? 1) === 1;
            const storedAmount = Number(item.amount || 0);
            const netAmount = isAmountWithIva
                ? Math.round((storedAmount / (1 + GLOBAL_IVA_RATE)) * 100) / 100
                : storedAmount;
            const amountWithIva = isAmountWithIva
                ? storedAmount
                : Math.round((storedAmount * (1 + GLOBAL_IVA_RATE)) * 100) / 100;
            const chargeId = Number(item.id_recurring_charge || 0);

            if (status === "Pagado") {
                badgeClass = "bg-success";
            } else if (status === "Pagado Parcial") {
                badgeClass = "bg-warning text-dark";
            }

            return `
                <tr>
                    <td>${escapeHTML(formatMonthLabel(item.charge_month))}</td>
                    <td>${escapeHTML(item.sale_folio || "-")}</td>
                    <td>${escapeHTML(item.company || "-")}</td>
                    <td>${formatMoney(netAmount)}</td>
                    <td>${formatMoney(amountWithIva)}</td>
                    <td>${formatMoney(item.paid_amount)}</td>
                    <td>${formatMoney(item.pending_amount)}</td>
                    <td><span class="badge ${badgeClass}">${escapeHTML(status)}</span></td>
                    <td>
                        <div class="d-flex flex-column gap-2 recurring-edit-box" data-charge-id="${chargeId}">
                            <input
                                type="number"
                                class="form-control form-control-sm recurring-net-input"
                                min="0.01"
                                step="0.01"
                                value="${Number(netAmount || 0).toFixed(2)}"
                            >
                            <div class="form-check">
                                <input
                                    class="form-check-input recurring-iva-check"
                                    type="checkbox"
                                    id="recurringIva${chargeId}"
                                    ${isAmountWithIva ? "checked" : ""}
                                >
                                <label class="form-check-label small" for="recurringIva${chargeId}">Aplicar IVA</label>
                            </div>
                            <button type="button" class="btn btn-sm btn-outline-primary save-recurring-charge" data-charge-id="${chargeId}">Guardar</button>
                        </div>
                    </td>
                    <td class="text-end">
                        ${Number(item.pending_amount || 0) > 0 ? `
                            <button type="button" class="btn btn-sm btn-outline-success mark-paid-recurring" data-recurring-charge-id="${Number(item.id_recurring_charge || 0)}" data-sale-id="${item.id_sale}" data-amount="${Number(item.pending_amount || 0)}" data-month="${escapeHTML(formatMonthLabel(item.charge_month))}">
                                <i class="bi bi-check2-circle me-1"></i>Marcar pagado
                            </button>
                        ` : `<span class="text-muted small">Sin acción</span>`}
                    </td>
                </tr>
            `;
        }).join("");

        if (!recurringBoardPagination) return;

        if (items.length <= RECURRING_BOARD_PAGE_SIZE) {
            recurringBoardPagination.innerHTML = "";
            return;
        }

        const prevDisabled = recurringBoardCurrentPage <= 1 ? "disabled" : "";
        const nextDisabled = recurringBoardCurrentPage >= totalPages ? "disabled" : "";

        recurringBoardPagination.innerHTML = `
            <button type="button" class="btn btn-sm btn-outline-secondary" ${prevDisabled} data-board-page="prev">Anterior</button>
            <span class="small text-muted">Página ${recurringBoardCurrentPage} de ${totalPages}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" ${nextDisabled} data-board-page="next">Siguiente</button>
        `;

        recurringBoardPagination.querySelector('[data-board-page="prev"]')?.addEventListener("click", () => {
            if (recurringBoardCurrentPage > 1) {
                recurringBoardCurrentPage -= 1;
                renderRecurringBoardTable(recurringBoardCache);
            }
        });

        recurringBoardPagination.querySelector('[data-board-page="next"]')?.addEventListener("click", () => {
            if (recurringBoardCurrentPage < totalPages) {
                recurringBoardCurrentPage += 1;
                renderRecurringBoardTable(recurringBoardCache);
            }
        });
    }

    async function loadRecurringBoard() {
        const response = await apiFetch("/api/sales/recurring-board");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudo cargar el tablero mensual");
        }

        const data = payload.data || {};
        const items = data.items || [];
        recurringBoardCache = items;
        recurringBoardCurrentPage = 1;

        if (recurringBoardMonth) {
            recurringBoardMonth.textContent = data.month_label || "Mes actual";
        }

        if (recurringBoardPendingCount) {
            recurringBoardPendingCount.textContent = `${data.pending_count || 0} pendientes`;
        }

        if (recurringBoardPaidCount) {
            recurringBoardPaidCount.textContent = `${data.paid_count || 0} pagados`;
        }

        if (recurringBoardPendingAmount) {
            recurringBoardPendingAmount.textContent = formatMoney(data.pending_amount || 0);
        }

        if (recurringBoardPaidAmount) {
            recurringBoardPaidAmount.textContent = formatMoney(data.paid_amount || 0);
        }

        renderRecurringBoardTable(items);
    }

    function resetPaymentModalState() {
        paymentForm.reset();
        selectedRecurringChargeId = null;

        if (paymentId) paymentId.value = "";
        if (paymentSaleId) paymentSaleId.value = "";
        if (paymentApplyTo) {
            paymentApplyTo.value = "base";
            paymentApplyTo.disabled = false;
        }
        if (paymentRecurringTargetInfo) {
            paymentRecurringTargetInfo.classList.add("d-none");
            paymentRecurringTargetInfo.textContent = "";
        }
        if (paymentQuoteReferenceInfo) paymentQuoteReferenceInfo.textContent = "";
        if (paymentModalTitle) paymentModalTitle.textContent = "Registrar pago";
        if (paymentSubmitButton) paymentSubmitButton.textContent = "Guardar pago";
    }

    async function ensurePaymentContextForSale(saleId) {
        if (paymentContextBySaleId.has(Number(saleId))) {
            return paymentContextBySaleId.get(Number(saleId));
        }

        const saleResponse = await apiFetch(`/api/sales/${saleId}`);
        const salePayload = await saleResponse.json().catch(() => ({}));

        if (!saleResponse.ok || !salePayload.success) {
            throw new Error(salePayload.message || "No se pudo cargar la cotizacion para referencia");
        }

        const sale = salePayload.data?.sale || {};
        const quoteItems = salePayload.data?.quote_items || [];

        const context = {
            sale,
            quoteItems,
            suggestedReference: buildQuoteReference(sale, quoteItems),
        };

        paymentContextBySaleId.set(Number(saleId), context);
        return context;
    }

    function openPaymentModalForSale(saleId) {
        const context = paymentContextBySaleId.get(Number(saleId));
        if (!context) return;

        resetPaymentModalState();

        paymentSaleId.value = String(saleId);
        paymentReference.value = "";
        paymentNotes.value = "";
        if (paymentApplyTo) {
            paymentApplyTo.value = "base";
            paymentApplyTo.disabled = false;
        }
        renderQuoteItemsInPaymentModal(context.quoteItems || []);

        if (paymentQuoteReferenceInfo) {
            paymentQuoteReferenceInfo.textContent = context.suggestedReference
                ? `Sugerida (opcional): ${context.suggestedReference}`
                : "Sin referencia sugerida";
        }

        paymentModal.show();
    }

    async function openRecurringChargePayment(saleId, recurringChargeId, amount, monthLabel) {
        await ensurePaymentContextForSale(saleId);
        openPaymentModalForSale(saleId);
        selectedRecurringChargeId = Number(recurringChargeId || 0) || null;
        currentSaleId = null;
        const context = paymentContextBySaleId.get(Number(saleId));

        if (paymentApplyTo) {
            paymentApplyTo.value = "recurring";
            paymentApplyTo.disabled = true;
        }

        if (paymentAmount) {
            paymentAmount.value = String(Number(amount || 0));
        }

        if (paymentReference) {
            paymentReference.value = `Pago mensual ${monthLabel}`;
        }

        if (paymentNotes) {
            paymentNotes.value = `Marcado desde el tablero mensual`;
        }

        if (paymentRecurringTargetInfo) {
            const folio = context?.sale?.sale_folio ? String(context.sale.sale_folio) : "-";
            paymentRecurringTargetInfo.textContent = `Objetivo de cobro: Mes ${monthLabel} | Folio ${folio}`;
            paymentRecurringTargetInfo.classList.remove("d-none");
        }
    }

    function openPaymentModalForEdit(payment) {
        const paymentSale = Number(payment.id_sale);
        const context = paymentContextBySaleId.get(paymentSale);

        if (!context) return;

        resetPaymentModalState();

        if (paymentId) paymentId.value = String(payment.id_payment);
        paymentSaleId.value = String(paymentSale);
        paymentAmount.value = String(payment.amount ?? "");
        paymentMethod.value = payment.payment_method || "Transferencia";
        paymentReference.value = payment.reference || "";
        paymentNotes.value = payment.notes || "";
        if (paymentApplyTo) {
            paymentApplyTo.value = Number(payment.id_recurring_charge || 0) > 0 ? "recurring" : "base";
            paymentApplyTo.disabled = true;
        }

        if (paymentModalTitle) paymentModalTitle.textContent = "Editar pago";
        if (paymentSubmitButton) paymentSubmitButton.textContent = "Actualizar pago";

        renderQuoteItemsInPaymentModal(context.quoteItems || []);

        if (paymentQuoteReferenceInfo) {
            paymentQuoteReferenceInfo.textContent = context.suggestedReference
                ? `Sugerida (opcional): ${context.suggestedReference}`
                : "Sin referencia sugerida";
        }

        paymentModal.show();
    }

    async function openDetail(id) {
        currentSaleId = Number(id);

        const [saleResponse, paymentsResponse] = await Promise.all([
            apiFetch(`/api/sales/${id}`),
            apiFetch(`/api/sale-payments/${id}`),
        ]);

        const salePayload = await saleResponse.json().catch(() => ({}));
        const paymentsPayload = await paymentsResponse.json().catch(() => ({}));

        if (!saleResponse.ok || !salePayload.success) {
            throw new Error(salePayload.message || "No se pudo cargar la venta");
        }

        if (!paymentsResponse.ok || !paymentsPayload.success) {
            throw new Error(paymentsPayload.message || "No se pudieron cargar los pagos");
        }

        const sale = salePayload.data?.sale || {};
        const quoteItems = salePayload.data?.quote_items || [];
        const recurringCharges = salePayload.data?.recurring_charges || [];
        const payments = paymentsPayload.data || [];

        currentPaymentsById = new Map(payments.map((item) => [Number(item.id_payment), item]));

        paymentContextBySaleId.set(Number(id), {
            sale,
            quoteItems,
            suggestedReference: buildQuoteReference(sale, quoteItems),
        });

        detailBody.innerHTML = `
		<div class="row g-3 mb-3">
			<div class="col-md-4">
				<div class="text-muted small">Folio venta</div>
				<div class="fw-semibold">${escapeHTML(sale.sale_folio || "-")}</div>
			</div>
			<div class="col-md-4">
				<div class="text-muted small">Estatus venta</div>
				<div class="fw-semibold">${escapeHTML(sale.sale_status || "Activa")}</div>
			</div>
			<div class="col-md-4">
				<div class="text-muted small">Estatus pago</div>
				<div class="fw-semibold">${escapeHTML(sale.payment_status || "Pendiente")}</div>
			</div>
			<div class="col-md-4">
                <div class="text-muted small">Empresa</div>
                <div class="fw-semibold">${escapeHTML(sale.company || "-")}</div>
            </div>
            <div class="col-md-4">
                <div class="text-muted small">Folio cotizacion</div>
                <div class="fw-semibold">${escapeHTML(sale.quote_folio ? `COT-${sale.quote_folio}` : "-")}</div>
            </div>
            <div class="col-md-4">
				<div class="text-muted small">Subtotal</div>
				<div class="fw-semibold">${formatMoney(sale.subtotal, sale.currency || "MXN")}</div>
			</div>
			<div class="col-md-4">
				<div class="text-muted small">IVA</div>
				<div class="fw-semibold">${formatMoney(sale.iva, sale.currency || "MXN")}</div>
			</div>
			<div class="col-md-4">
				<div class="text-muted small">Total</div>
				<div class="fw-semibold">${formatMoney(sale.total, sale.currency || "MXN")}</div>
			</div>
		</div>

        <h6 class="fw-semibold">Conceptos cotizados</h6>
        <table class="table table-sm align-middle mb-3">
            <thead>
                <tr>
                    <th>Descripcion</th>
                    <th>Periodicidad</th>
                    <th>Cantidad</th>
                    <th>Costo unitario</th>
                    <th>Total linea</th>
                </tr>
            </thead>
            <tbody>
                ${renderQuoteItemsTable(quoteItems)}
            </tbody>
        </table>

        <h6 class="fw-semibold">Cobros mensuales recurrentes</h6>
        <table class="table table-sm align-middle mb-3">
            <thead>
                <tr>
                    <th>Mes</th>
                    <th>Programado</th>
                    <th>Pagado</th>
                    <th>Pendiente</th>
                    <th>Estado</th>
                </tr>
            </thead>
            <tbody>
                ${renderRecurringChargesTable(recurringCharges)}
            </tbody>
        </table>

		<h6 class="fw-semibold">Pagos</h6>
		<table class="table table-sm align-middle mb-0">
			<thead>
				<tr>
					<th>Fecha</th>
                    <th>Mes</th>
					<th>Monto</th>
					<th>Metodo</th>
					<th>Referencia</th>
					<th>Notas</th>
                    <th class="text-end">Acciones</th>
				</tr>
			</thead>
			<tbody>
				${renderPaymentsTable(payments)}
			</tbody>
		</table>
	`;

        detailModal.show();
    }

    async function savePayment(event) {
        event.preventDefault();

        const payload = {
            id_sale: Number(paymentSaleId.value),
            amount: Number(paymentAmount.value),
            payment_method: paymentMethod.value,
            reference: paymentReference.value.trim() || null,
            notes: paymentNotes.value.trim() || null,
            recurring_charge_id: selectedRecurringChargeId,
            apply_to: paymentApplyTo?.value || "base",
        };

        const editingPaymentId = paymentId?.value ? Number(paymentId.value) : null;
        const endpoint = editingPaymentId ? `/api/sale-payments/${editingPaymentId}` : "/api/sale-payments";
        const method = editingPaymentId ? "PATCH" : "POST";

        const response = await apiFetch(endpoint, {
            method,
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo registrar el pago");
        }

        paymentModal.hide();
        resetPaymentModalState();
        await loadSales();

        if (currentSaleId) {
            await openDetail(currentSaleId);
        }
    }

    async function deletePayment(paymentIdValue) {
        const confirmed = await showConfirm("¿Eliminar este pago? Esta acción recalcula el saldo.");
        if (!confirmed) return;

        const response = await apiFetch(`/api/sale-payments/${paymentIdValue}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo eliminar el pago");
        }

        await loadSales();

        if (currentSaleId) {
            await openDetail(currentSaleId);
        }
    }

    async function toggleStatus(id) {
        const sale = salesCache.find((item) => Number(item.id_sale) === Number(id));
        if (!sale) return;

        const next = sale.sale_status === "Activa" ? "Cancelada" : "Activa";
        const confirmed = await showConfirm(`¿Cambiar estatus a ${next}?`);
        if (!confirmed) return;

        const response = await apiFetch(`/api/sales/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ sale_status: next }),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo actualizar el estatus");
        }

        await loadSales();
    }

    async function deleteSale(id) {
        const confirmed = await showConfirm("¿Eliminar esta venta?");
        if (!confirmed) return;

        const response = await apiFetch(`/api/sales/${id}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo eliminar la venta");
        }

        await loadSales();
    }

    if (table && paymentForm) {
        searchInput.addEventListener("input", applySearch);

        async function handleSalesAction(event) {
            const detailBtn = event.target.closest(".detail-sale");
            const addPaymentBtn = event.target.closest(".add-payment");
            const toggleBtn = event.target.closest(".toggle-status");
            const deleteBtn = event.target.closest(".delete-sale");
            const markPaidBtn = event.target.closest(".mark-paid-recurring");

            try {
                if (detailBtn) {
                    await openDetail(detailBtn.dataset.id);
                    return;
                }

                if (addPaymentBtn) {
                    const saleId = Number(addPaymentBtn.dataset.id);
                    await ensurePaymentContextForSale(saleId);
                    openPaymentModalForSale(saleId);
                    return;
                }

                if (markPaidBtn) {
                    event.preventDefault();
                    event.stopPropagation();
                    const saleId = Number(markPaidBtn.dataset.saleId);
                    const recurringChargeId = Number(markPaidBtn.dataset.recurringChargeId || 0);
                    const amount = Number(markPaidBtn.dataset.amount || 0);
                    const monthLabel = markPaidBtn.dataset.month || "";

                    await openRecurringChargePayment(saleId, recurringChargeId, amount, monthLabel);
                    return;
                }

                const saveRecurringBtn = event.target.closest(".save-recurring-charge");
                if (saveRecurringBtn) {
                    event.preventDefault();
                    event.stopPropagation();

                    const chargeId = Number(saveRecurringBtn.dataset.chargeId || 0);
                    const row = saveRecurringBtn.closest("tr");
                    const netInput = row?.querySelector(".recurring-net-input");
                    const ivaCheck = row?.querySelector(".recurring-iva-check");

                    const netAmount = Number(netInput?.value || 0);
                    if (!chargeId || Number.isNaN(netAmount) || netAmount <= 0) {
                        throw new Error("Ingresa un monto neto valido");
                    }

                    const response = await apiFetch(`/api/sales/recurring-charge/${chargeId}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                            net_amount: netAmount,
                            apply_iva: !!ivaCheck?.checked,
                        }),
                    });

                    const result = await response.json().catch(() => ({}));
                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "No se pudo actualizar el cobro mensual");
                    }

                    await loadSales();
                    await showAlert("Cobro mensual actualizado");
                    return;
                }

                if (toggleBtn) {
                    await toggleStatus(toggleBtn.dataset.id);
                    return;
                }

                if (deleteBtn) {
                    await deleteSale(deleteBtn.dataset.id);
                }
            } catch (error) {
                await showAlert(error.message);
            }
        }

        table.addEventListener("click", handleSalesAction);
        cards?.addEventListener("click", handleSalesAction);
        recurringBoardTable?.addEventListener("click", handleSalesAction);

        detailBody?.addEventListener("click", async (event) => {
            const editBtn = event.target.closest(".edit-payment");
            const deleteBtn = event.target.closest(".delete-payment");

            try {
                if (editBtn) {
                    const payment = currentPaymentsById.get(Number(editBtn.dataset.paymentId));
                    if (!payment) {
                        throw new Error("No se encontró el pago para editar");
                    }
                    await ensurePaymentContextForSale(payment.id_sale);
                    openPaymentModalForEdit(payment);
                    return;
                }

                if (deleteBtn) {
                    await deletePayment(deleteBtn.dataset.paymentId);
                }
            } catch (error) {
                await showAlert(error.message);
            }
        });

        paymentForm.addEventListener("submit", async (event) => {
            try {
                await savePayment(event);
            } catch (error) {
                await showAlert(error.message);
            }
        });

        window.addEventListener("app:resize", applySearch);
        window.addEventListener("resize", applySearch);
        window.addEventListener("orientationchange", () => {
            setTimeout(applySearch, 200);
        });

        loadSales().catch((error) => {
            table.innerHTML = `
			<tr>
                <td colspan="8" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
			</tr>
		`;
        });
    }
})();
