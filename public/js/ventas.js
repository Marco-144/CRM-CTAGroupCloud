(() => {
    const table = document.getElementById("salesTable");
    const searchInput = document.getElementById("salesSearch");
    const detailBody = document.getElementById("saleDetailBody");

    const detailModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("saleDetailModal"));
    const paymentModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("addPaymentModal"));

    const paymentForm = document.getElementById("paymentForm");
    const paymentSaleId = document.getElementById("paymentSaleId");
    const paymentAmount = document.getElementById("paymentAmount");
    const paymentMethod = document.getElementById("paymentMethod");
    const paymentReference = document.getElementById("paymentReference");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let salesCache = [];
    let currentSaleId = null;
    const pageSize = 7;
    let currentPage = 1;
    const paginationContainer = ensurePaginationContainer(table, "salesPagination");

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
        if (!rows.length) {
            table.innerHTML = `
			<tr>
                <td colspan="8" class="text-center text-muted py-4">No hay ventas registradas</td>
			</tr>
		`;
            renderPagination(0, rows);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * pageSize;
        const paginatedRows = rows.slice(start, start + pageSize);

        table.innerHTML = paginatedRows.map((sale) => `
		<tr>
			<td>${escapeHTML(sale.sale_folio || "-")}</td>
			<td>${escapeHTML(sale.company || "-")}</td>
			<td>${formatDate(sale.sale_date)}</td>
			<td>${formatMoney(sale.total)}</td>
            <td>${formatMoney(sale.pending_amount)}</td>
			<td>${escapeHTML(sale.payment_status || "Pendiente")}</td>
			<td>${escapeHTML(sale.sale_status || "Activa")}</td>
			<td class="text-end">
				<button class="btn btn-sm btn-outline-primary me-2 detail-sale" data-id="${sale.id_sale}">
					<i class="bi bi-eye"></i>
				</button>
				<button class="btn btn-sm btn-outline-success me-2 add-payment" data-id="${sale.id_sale}">
					<i class="bi bi-cash-coin"></i>
				</button>
				<button class="btn btn-sm btn-outline-secondary me-2 toggle-status" data-id="${sale.id_sale}">
					<i class="bi bi-arrow-repeat"></i>
				</button>
				<button class="btn btn-sm btn-outline-danger delete-sale" data-id="${sale.id_sale}">
					<i class="bi bi-trash"></i>
				</button>
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
    }

    function renderPaymentsTable(payments) {
        if (!payments.length) {
            return `<tr><td colspan="5" class="text-center text-muted">Sin pagos registrados</td></tr>`;
        }

        return payments.map((item) => `
		<tr>
			<td>${formatDate(item.payment_date)}</td>
			<td>${formatMoney(item.amount, item.currency || "MXN")}</td>
			<td>${escapeHTML(item.payment_method || "-")}</td>
			<td>${escapeHTML(item.reference || "-")}</td>
			<td>${escapeHTML(item.notes || "-")}</td>
		</tr>
	`).join("");
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
        const payments = paymentsPayload.data || [];

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

		<h6 class="fw-semibold">Pagos</h6>
		<table class="table table-sm align-middle mb-0">
			<thead>
				<tr>
					<th>Fecha</th>
					<th>Monto</th>
					<th>Metodo</th>
					<th>Referencia</th>
					<th>Notas</th>
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
        };

        const response = await apiFetch("/api/sale-payments", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo registrar el pago");
        }

        paymentModal.hide();
        paymentForm.reset();
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

        table.addEventListener("click", async (event) => {
            const detailBtn = event.target.closest(".detail-sale");
            const addPaymentBtn = event.target.closest(".add-payment");
            const toggleBtn = event.target.closest(".toggle-status");
            const deleteBtn = event.target.closest(".delete-sale");

            try {
                if (detailBtn) {
                    await openDetail(detailBtn.dataset.id);
                    return;
                }

                if (addPaymentBtn) {
                    paymentSaleId.value = addPaymentBtn.dataset.id;
                    paymentAmount.value = "";
                    paymentReference.value = "";
                    paymentModal.show();
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
        });

        paymentForm.addEventListener("submit", async (event) => {
            try {
                await savePayment(event);
            } catch (error) {
                await showAlert(error.message);
            }
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
