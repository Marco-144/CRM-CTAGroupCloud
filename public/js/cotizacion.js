(() => {

    const cotizacionesTable = document.getElementById("cotizacionesTable");
    const totalCotizaciones = document.getElementById("totalCotizaciones");
    const sumTotalCotizaciones = document.getElementById("sumTotalCotizaciones");
    const sumCantidadCotizaciones = document.getElementById("sumCantidadCotizaciones");
    const openAddService = document.getElementById("openAddService");
    const cotizacionDateFilter = document.getElementById("cotizacionDateFilter");
    const clearDateFilter = document.getElementById("clearDateFilter");
    const cotizacionSearch = document.getElementById("cotizacionSearch");
    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    const viewModal = new bootstrap.Modal(document.getElementById("viewCotizacionModal"));
    const viewBody = document.getElementById("viewCotizacionBody");
    const toggleFromDetailBtn = document.getElementById("toggleFromDetailBtn");
    const cancelCotizacionBtn = document.getElementById("cancelCotizacionBtn");

    let cotizacionesCache = [];
    let filteredData = [];
    let currentViewId = null;
    let saleModalRefs = null;
    const pageSize = 7;
    let currentPage = 1;
    const paginationContainer = ensurePaginationContainer(cotizacionesTable, "cotizacionesPagination");

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

    function renderPagination(totalItems) {
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
                renderTable(filteredData);
            }
        });

        paginationContainer.querySelector('[data-page-action="next"]')?.addEventListener("click", () => {
            if (currentPage < totalPages) {
                currentPage += 1;
                renderTable(filteredData);
            }
        });
    }

    function getSaleModalRefs() {
        if (saleModalRefs) return saleModalRefs;

        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
            <div class="modal fade" id="createSaleModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-sm-down">
                    <div class="modal-content rounded-4">
                        <div class="modal-header">
                            <h5 class="modal-title fw-semibold">Generar venta</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <form id="createSaleForm">
                            <div class="modal-body sale-modal-body">
                                <input type="hidden" id="saleQuoteId">
                                <input type="hidden" id="saleProspectId">

                                <h6 class="fw-semibold mb-3">Datos fiscales del cliente</h6>
                                <div class="row g-3 mb-4">
                                    <div class="col-md-4">
                                        <label class="form-label">RFC</label>
                                        <input class="form-control" id="saleRfc" maxlength="20">
                                    </div>
                                    <div class="col-md-8">
                                        <label class="form-label">Razon social</label>
                                        <input class="form-control" id="saleFiscalName">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Regimen fiscal</label>
                                        <input class="form-control" id="saleFiscalRegime">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Email fiscal</label>
                                        <input type="email" class="form-control" id="saleBillingEmail">
                                    </div>
                                    <div class="col-md-12">
                                        <label class="form-label">Direccion</label>
                                        <input class="form-control" id="saleAddress">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Ciudad</label>
                                        <input class="form-control" id="saleCity">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Estado</label>
                                        <input class="form-control" id="saleState">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">CP</label>
                                        <input class="form-control" id="salePostalCode">
                                    </div>
                                    <div class="col-md-12">
                                        <label class="form-label">Constancia de situacion fiscal (PDF)</label>
                                        <input type="file" class="form-control" id="saleFiscalDoc" accept="application/pdf">
                                        <small class="text-muted">Opcional: se guardara en server/uploads/fiscal_docs</small>
                                    </div>
                                </div>

                                <h6 class="fw-semibold mb-3">Pago inicial (opcional)</h6>
                                <div class="row g-3 mb-4">
                                    <div class="col-md-4">
                                        <label class="form-label">Monto</label>
                                        <input type="number" class="form-control" id="saleInitialAmount" min="0" step="0.01" value="0">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Metodo</label>
                                        <select class="form-select" id="salePaymentMethod">
                                            <option value="Transferencia">Transferencia</option>
                                            <option value="Efectivo">Efectivo</option>
                                            <option value="Tarjeta">Tarjeta</option>
                                            <option value="Cheque">Cheque</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Referencia</label>
                                        <input class="form-control" id="salePaymentReference">
                                    </div>
                                </div>

                                <div class="mb-0">
                                    <label class="form-label">Notas de venta</label>
                                    <textarea class="form-control" id="saleNotes" rows="2"></textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button type="submit" class="btn btn-success">Generar venta</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(wrapper.firstElementChild);

        const modalEl = document.getElementById("createSaleModal");
        const form = document.getElementById("createSaleForm");

        saleModalRefs = {
            modalEl,
            modal: bootstrap.Modal.getOrCreateInstance(modalEl),
            form,
            quoteId: document.getElementById("saleQuoteId"),
            prospectId: document.getElementById("saleProspectId"),
            rfc: document.getElementById("saleRfc"),
            fiscalName: document.getElementById("saleFiscalName"),
            fiscalRegime: document.getElementById("saleFiscalRegime"),
            billingEmail: document.getElementById("saleBillingEmail"),
            address: document.getElementById("saleAddress"),
            city: document.getElementById("saleCity"),
            state: document.getElementById("saleState"),
            postalCode: document.getElementById("salePostalCode"),
            fiscalDoc: document.getElementById("saleFiscalDoc"),
            initialAmount: document.getElementById("saleInitialAmount"),
            paymentMethod: document.getElementById("salePaymentMethod"),
            paymentReference: document.getElementById("salePaymentReference"),
            notes: document.getElementById("saleNotes"),
        };

        form.addEventListener("submit", async (event) => {
            event.preventDefault();

            try {
                const quoteId = Number(saleModalRefs.quoteId.value);
                if (!quoteId) {
                    await showAlert("Cotizacion invalida");
                    return;
                }

                const amount = Number(saleModalRefs.initialAmount.value || 0);
                const prospectId = Number(saleModalRefs.prospectId.value || 0);
                const fiscalDocFile = saleModalRefs.fiscalDoc.files?.[0] || null;

                if (fiscalDocFile) {
                    const profileFormData = new FormData();
                    profileFormData.append("rfc", saleModalRefs.rfc.value.trim());
                    profileFormData.append("fiscal_name", saleModalRefs.fiscalName.value.trim());
                    profileFormData.append("fiscal_regime", saleModalRefs.fiscalRegime.value.trim());
                    profileFormData.append("billing_email", saleModalRefs.billingEmail.value.trim());
                    profileFormData.append("address", saleModalRefs.address.value.trim());
                    profileFormData.append("city", saleModalRefs.city.value.trim());
                    profileFormData.append("state", saleModalRefs.state.value.trim());
                    profileFormData.append("postal_code", saleModalRefs.postalCode.value.trim());
                    profileFormData.append("country", "Mexico");
                    profileFormData.append("tax_certificate_pdf", fiscalDocFile);

                    const uploadResponse = await apiFetch(`/api/clients/${prospectId}/profile`, {
                        method: "PUT",
                        body: profileFormData,
                    });

                    const uploadPayload = await uploadResponse.json().catch(() => ({}));
                    if (!uploadResponse.ok || !uploadPayload.success) {
                        throw new Error(uploadPayload.message || "No se pudo subir la constancia fiscal");
                    }
                }

                const payload = {
                    clientProfile: {
                        rfc: saleModalRefs.rfc.value.trim(),
                        fiscal_name: saleModalRefs.fiscalName.value.trim(),
                        fiscal_regime: saleModalRefs.fiscalRegime.value.trim(),
                        billing_email: saleModalRefs.billingEmail.value.trim(),
                        address: saleModalRefs.address.value.trim(),
                        city: saleModalRefs.city.value.trim(),
                        state: saleModalRefs.state.value.trim(),
                        postal_code: saleModalRefs.postalCode.value.trim(),
                        country: "Mexico",
                    },
                    payment: {
                        amount,
                        payment_method: saleModalRefs.paymentMethod.value,
                        reference: saleModalRefs.paymentReference.value.trim(),
                    },
                    notes: saleModalRefs.notes.value.trim(),
                };

                const response = await apiFetch(`/api/sales/from-quote/${quoteId}`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });

                const result = await response.json().catch(() => ({}));

                if (!response.ok || !result.success) {
                    throw new Error(result.message || "No se pudo generar la venta");
                }

                saleModalRefs.modal.hide();
                await showAlert(`Venta generada correctamente (${result.sale_folio || "sin folio"})`);
                await loadCotizaciones();
            } catch (error) {
                await showAlert(error.message || "Error al generar la venta");
            }
        });

        return saleModalRefs;
    }


    /* ============================
        FILTROS 
    ============================ */
    const cotizacionFilter = document.getElementById("cotizacionFilter");

    cotizacionFilter.addEventListener("change", async (e) => {
        const value = e.target.value;

        if (!value) {
            filteredData = applyBaseFilters(cotizacionesCache);
            renderTable(filteredData);
            updateKpis(filteredData);
            return;
        }

        if (value.includes("total") || value.includes("cantidad")) {
            filteredData = applyBaseFilters(cotizacionesCache);
            ordenarLocal(value);
        } else if (value.includes("periodicidad")) {
            await filtrarPorPeriodicidad(value);
        } else {
            filteredData = applyBaseFilters(cotizacionesCache);
            renderTable(filteredData);
            updateKpis(filteredData);
        }
    });

    function ordenarLocal(tipo) {
        filteredData = [...filteredData];

        switch (tipo) {
            case "total_desc":
                filteredData.sort((a, b) => b.total - a.total);
                break;

            case "total_asc":
                filteredData.sort((a, b) => a.total - b.total);
                break;

            case "cantidad_desc":
                filteredData.sort((a, b) => (b.total_cantidad || 0) - (a.total_cantidad || 0));
                break;

            case "cantidad_asc":
                filteredData.sort((a, b) => (a.total_cantidad || 0) - (b.total_cantidad || 0));
                break;
        }

        currentPage = 1;
        renderTable(filteredData);
        updateKpis(filteredData);
    }

    async function filtrarPorPeriodicidad(tipo) {

        if (tipo === "periodicidad_all") {
            filteredData = applyBaseFilters(cotizacionesCache);
            currentPage = 1;
            renderTable(filteredData);
            updateKpis(filteredData);
            return;
        }

        const mapa = {
            periodicidad_anual: "Anual",
            periodicidad_mensual: "Mensual",
            periodicidad_pago_unico: "Pago Unico"
        };

        const periodicidadBuscada = mapa[tipo];

        const filtradas = [];

        for (const cot of cotizacionesCache) {

            const res = await apiFetch(`/api/cotizaciones/${cot.id_cotizacion}`);
            const data = await res.json();

            if (!data.success) continue;

            const tienePeriodicidad = data.data.conceptos.some(c =>
                c.periodicidad === periodicidadBuscada
            );

            if (tienePeriodicidad) {
                filtradas.push(cot);
            }
        }

        filteredData = applyBaseFilters(filtradas);
        currentPage = 1;
        renderTable(filteredData);
        updateKpis(filteredData);
    }

    function applyBaseFilters(sourceData) {
        const searchTerm = (cotizacionSearch?.value || "").trim().toLowerCase();
        const selectedDate = cotizacionDateFilter?.value || "";
        const activeFilter = cotizacionFilter?.value || "";

        const statusMap = {
            status_activo: "Activo",
            status_inactivo: "Inactivo",
            status_cancelada: "Cancelada"
        };

        const selectedStatus = statusMap[activeFilter] || "";

        return sourceData.filter(item => {
            const prospecto = String(item.prospecto || "").toLowerCase();
            const matchSearch = !searchTerm || prospecto.includes(searchTerm);
            const matchStatus = !selectedStatus || String(item.status || "Activo") === selectedStatus;

            if (!matchStatus) {
                return false;
            }

            if (!selectedDate) {
                return matchSearch;
            }

            const itemDate = new Date(item.updated_at);
            const formatted = itemDate.toISOString().split("T")[0];

            return matchSearch && formatted === selectedDate;
        });
    }

    async function applyDateAndSearchFilters() {
        currentPage = 1;
        const activeFilter = cotizacionFilter.value;

        if (activeFilter && activeFilter.includes("periodicidad") && activeFilter !== "periodicidad_all") {
            await filtrarPorPeriodicidad(activeFilter);
            return;
        }

        filteredData = applyBaseFilters(cotizacionesCache);

        if (activeFilter && (activeFilter.includes("total") || activeFilter.includes("cantidad"))) {
            ordenarLocal(activeFilter);
            return;
        }

        renderTable(filteredData);
        updateKpis(filteredData);
    }


    cotizacionDateFilter.addEventListener("change", async () => {
        await applyDateAndSearchFilters();
    });

    clearDateFilter.addEventListener("click", () => {
        cotizacionDateFilter.value = "";
        filteredData = applyBaseFilters(cotizacionesCache);
        currentPage = 1;
        renderTable(filteredData);
        updateKpis(filteredData);
    });

    cotizacionSearch.addEventListener("input", async () => {
        await applyDateAndSearchFilters();
    });

    /* ============================
       CARGAR LISTADO
    ============================ */
    async function loadCotizaciones() {
        const res = await apiFetch("/api/cotizaciones");
        const data = await res.json();

        if (!data.success) return;

        cotizacionesCache = data.data;
        filteredData = applyBaseFilters(cotizacionesCache);
        currentPage = 1;

        renderTable(filteredData);
        updateKpis(filteredData);
    }

    openAddService.addEventListener("click", () => {
        goToAdd();
    });

    /* ============================
       RENDER TABLA
    ============================ */
    function renderTable(data) {

        if (!data.length) {
            cotizacionesTable.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">
                    No hay cotizaciones registradas
                </td>
            </tr>
        `;
            renderPagination(0);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * pageSize;
        const paginatedData = data.slice(start, start + pageSize);

        cotizacionesTable.innerHTML = paginatedData.map(item => {
            const folio = String(item.Folio ?? item.folio ?? 0).padStart(5, "0");
            const isInactive = item.status === "Inactivo";
            const isCompleted = item.status === "Completada";
            const isCancelled = item.status === "Cancelada";
            const statusBadgeClass = isCompleted
                ? "bg-primary"
                : isCancelled
                    ? "bg-danger"
                    : isInactive
                        ? "bg-secondary"
                        : "bg-success";
            const isPdfDisabled = isInactive || isCancelled;

            return `
        <tr>
            <td class="text-center">${folio}</td>
            <td>${item.prospecto}</td>
            <td>
                ${isCompleted
                    ? `<span class="badge bg-primary">${item.status || "Activo"}</span>`
                    : `<button class="btn btn-sm p-0 border-0 bg-transparent status-inline-btn" data-id="${item.id_cotizacion}" title="Cambiar estatus">
                        <span class="badge ${statusBadgeClass}">
                    ${item.status || "Activo"}
                </span>
                    </button>`}
            </td>
            <td class="text-center">${item.total_cantidad || 0}</td>
            <td class="text-center">${formatMoney(item.subtotal, item.moneda || "MXN")}</td>
            <td class="fw-semibold text-center">${formatMoney(item.total, item.moneda || "MXN")}</td>
            <td class="text-end">${formatDate(item.updated_at)}</td>
            <td class="text-end">

                <button class="btn btn-sm btn-outline-secondary me-2 detail-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-eye"></i>
                </button>

                <button class="btn btn-sm btn-outline-secondary me-2 edit-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-pencil"></i>
                </button>

                <button class="btn btn-sm btn-outline-danger me-2 delete-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-trash"></i>
                </button>

                <div class="vr me-2 "></div>

                <button class="btn btn-sm btn-outline-primary pdf-btn ${isPdfDisabled ? "disabled" : ""}"
                    data-id="${item.id_cotizacion}"
                    ${isPdfDisabled ? "disabled title='Cotizacion inactiva/cancelada: PDF no disponible'" : ""}>
                    <i class="bi bi-filetype-pdf"></i>
                </button>

                <button class="btn btn-sm btn-outline-success me-2 complete-sale-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-bag-check"></i>
                </button>

            </td>
        </tr>
    `;
        }).join("");

        renderPagination(data.length);
    }

    /* ============================
       KPIs
    ============================ */
    function updateKpis(data = filteredData) {

        const activeCotizaciones = data.filter(c => c.status === "Activo");

        const total = activeCotizaciones.reduce(
            (acc, item) => acc + Number(item.total || 0),
            0
        );

        const cantidad = activeCotizaciones.reduce(
            (acc, item) => acc + Number(item.total_cantidad || 0),
            0
        );

        totalCotizaciones.textContent = activeCotizaciones.length;
        sumTotalCotizaciones.textContent = formatMoney(total);
        sumCantidadCotizaciones.textContent = cantidad;
    }

    /* ============================
       EVENTOS TABLA
    ============================ */
    cotizacionesTable.addEventListener("click", async (e) => {

        const statusInlineBtn = e.target.closest(".status-inline-btn");
        const detailBtn = e.target.closest(".detail-btn");
        const editBtn = e.target.closest(".edit-btn");
        const completeSaleBtn = e.target.closest(".complete-sale-btn");
        const deleteBtn = e.target.closest(".delete-btn");
        const pdfBtn = e.target.closest(".pdf-btn");

        if (statusInlineBtn) {
            await toggleCotizacionStatus(statusInlineBtn.dataset.id);
            return;
        }

        if (detailBtn) {
            await openViewModal(detailBtn.dataset.id);
            return;
        }

        if (editBtn) {
            goToEdit(editBtn.dataset.id);
            return;
        }

        if (completeSaleBtn) {
            await completeCotizacionSale(completeSaleBtn.dataset.id);
            return;
        }

        if (deleteBtn) {
            await deleteCotizacionPermanent(deleteBtn.dataset.id);
            return;
        }

        if (pdfBtn) {
            if (pdfBtn.classList.contains("disabled") || pdfBtn.hasAttribute("disabled")) {
                return;
            }
            downloadPDF(pdfBtn.dataset.id);
            return;
        }
    });

    /* ============================
       MODAL VER
    ============================ */
    async function openViewModal(id) {

        const res = await apiFetch(`/api/cotizaciones/${id}`);
        const data = await res.json();

        if (!data.success) return;

        const cot = data.data;
        const folio = String(cot.Folio ?? cot.folio ?? 0).padStart(5, "0");
        const tipoCambio = Number(cot.tipo_cambio || 0).toFixed(2);
        currentViewId = id;

        viewBody.innerHTML = `
        <div class="card border-0 shadow-sm mb-4">
            <div class="card-body">
                <div class="row">
                    <div class="col-md-5">
                        <div class="text-muted small">Prospecto</div>
                        <div class="fw-semibold fs-5">${cot.prospecto}</div>
                    </div>
                    <div class="col-md-2">
                        <div class="text-muted small">Moneda</div>
                        <span class="badge bg-primary fs-6">${cot.moneda}</span>
                    </div>
                    <div class="col-md-2">
                        <div class="text-muted small">N° Folio</div>
                        <div class="fw-semibold">${folio}</div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-muted small">Tipo de cambio</div>
                        <div class="fw-semibold">${tipoCambio}</div>
                    </div>
                </div>
            </div>
        </div>

        <table class="table table-sm align-middle">
            <thead class="table-light">
                <tr>
                    <th>Descripción</th>
                    <th>Periodicidad</th>
                    <th class="text-center">Cantidad</th>
                    <th class="text-end">Costo Unitario</th>
                    <th class="text-end">Importe</th>
                </tr>
            </thead>
            <tbody>
                ${cot.conceptos.map(c => {
            const importe = c.cantidad * c.costo_unitario;
            return `
                    <tr>
                        <td>${c.descripcion}</td>
                        <td>${c.periodicidad}</td>
                        <td class="text-center">${c.cantidad}</td>
                        <td class="text-end">${formatMoney(c.costo_unitario)}</td>
                        <td class="text-end">${formatMoney(importe)}</td>
                    </tr>
                `;
        }).join("")}
            </tbody>
        </table>

        <div class="card border-0 bg-light mt-4">
            <div class="card-body text-end">
                <div class="mb-2">
                    <span class="text-muted">Subtotal:</span>
                    <span class="fw-semibold ms-2">${formatMoney(cot.subtotal)}</span>
                </div>
                <div class="mb-2">
                    <span class="text-muted">IVA (16%):</span>
                    <span class="fw-semibold ms-2">${formatMoney(cot.iva)}</span>
                </div>
                <div class="fs-5">
                    <span class="fw-bold">Total:</span>
                    <span class="fw-bold ms-2">${formatMoney(cot.total)}</span>
                </div>
            </div>
        </div>
    `;

        if (cot.status === "Cancelada") {
            toggleFromDetailBtn.textContent = "Activar cotizacion";
            cancelCotizacionBtn?.setAttribute("disabled", "disabled");
        } else {
            toggleFromDetailBtn.textContent = cot.status === "Inactivo"
                ? "Activar cotizacion"
                : "Desactivar cotizacion";
            cancelCotizacionBtn?.removeAttribute("disabled");
        }

        viewModal.show();

        document.getElementById("editCotizacionBtn").addEventListener("click", () => {
            viewModal.hide();
            goToEdit(cot.id_cotizacion);
        });
    }

    toggleFromDetailBtn?.addEventListener("click", async () => {
        if (!currentViewId) return;

        await toggleCotizacionStatus(currentViewId);
        await openViewModal(currentViewId);
    });

    cancelCotizacionBtn?.addEventListener("click", async () => {
        if (!currentViewId) return;

        const confirmed = await showConfirm("¿Deseas marcar esta cotizacion como cancelada?");
        if (!confirmed) return;

        const res = await apiFetch(`/api/cotizaciones/${currentViewId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Cancelada" })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
            await showAlert(data.message || "No se pudo cancelar la cotizacion");
            return;
        }

        await loadCotizaciones();
        await openViewModal(currentViewId);
    });

    /* ============================
       ELIMINAR
    ============================ */
    async function toggleCotizacionStatus(id) {
        const cotizacion = cotizacionesCache.find(item => String(item.id_cotizacion) === String(id));
        if (!cotizacion) return;

        const nextStatus = cotizacion.status === "Inactivo" ? "Activo" : "Inactivo";
        const confirmMessage = nextStatus === "Inactivo"
            ? "¿Deseas desactivar esta cotización?"
            : "¿Deseas activar esta cotización?";

        const confirmed = await showConfirm(confirmMessage);
        if (!confirmed) return;

        const res = await apiFetch(`/api/cotizaciones/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: nextStatus })
        });

        const data = await res.json();

        if (data.success) {
            await loadCotizaciones();
        } else {
            await showAlert("Error actualizando status");
        }
    }

    async function completeCotizacionSale(id) {
        const refs = getSaleModalRefs();

        const quoteResponse = await apiFetch(`/api/cotizaciones/${id}`);
        const quotePayload = await quoteResponse.json().catch(() => ({}));

        if (!quoteResponse.ok || !quotePayload.success) {
            await showAlert(quotePayload.message || "No se pudo cargar la cotizacion");
            return;
        }

        const quote = quotePayload.data;

        refs.quoteId.value = id;
        refs.prospectId.value = quote.id_prospect;
        refs.initialAmount.value = "0";
        refs.paymentReference.value = "";
        refs.notes.value = "";

        const clientResponse = await apiFetch(`/api/clients/${quote.id_prospect}`);
        const clientPayload = await clientResponse.json().catch(() => ({}));
        const client = clientPayload?.data || {};

        refs.rfc.value = client.rfc || "";
        refs.fiscalName.value = client.fiscal_name || "";
        refs.fiscalRegime.value = client.fiscal_regime || "";
        refs.billingEmail.value = client.billing_email || quote.email || "";
        refs.address.value = client.address || "";
        refs.city.value = client.city || "";
        refs.state.value = client.state || "";
        refs.postalCode.value = client.postal_code || "";
        refs.fiscalDoc.value = "";

        refs.modal.show();
    }

    async function deleteCotizacionPermanent(id) {
        const confirmDelete = await showConfirm("¿Eliminar definitivamente esta cotización? Esta acción no se puede deshacer.");
        if (!confirmDelete) return;

        const res = await apiFetch(`/api/cotizaciones/${id}/permanent`, {
            method: "DELETE"
        });

        const data = await res.json();

        if (data.success) {
            await loadCotizaciones();
        } else {
            await showAlert(data.message || "Error eliminando cotización");
        }
    }

    /* ============================
        DESCARGAR PDF
    ============================ */

    async function downloadPDF(id) {
        const previewWindow = window.open("", "_blank");

        try {
            const response = await apiFetch(`/api/cotizaciones/${id}/pdf`, {
                method: "GET"
            });

            if (!response) {
                return;
            }

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                throw new Error(payload.message || "No se pudo generar el PDF");
            }

            const pdfBlob = await response.blob();
            const blobUrl = URL.createObjectURL(pdfBlob);

            if (previewWindow) {
                previewWindow.location.href = blobUrl;
            } else {
                window.open(blobUrl, "_blank");
            }

            setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
        } catch (error) {
            if (previewWindow) {
                previewWindow.close();
            }

            await showAlert(error.message || "No se pudo abrir el PDF");
        }
    }

    /* ============================
       UTILIDADES
    ============================ */
    function goToAdd() {
        window.currentCotizacionId = null;

        loadView(
            'views/addCotizacion.html',
            'css/addCotizacion.css',
            'js/addCotizacion.js'
        );
    }

    function goToEdit(id) {
        window.currentCotizacionId = Number(id);

        loadView(
            "views/addCotizacion.html",
            "css/addCotizacion.css",
            "js/addCotizacion.js"
        );
    }

    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString("es-MX");
    }

    function formatMoney(amount, moneda = "MXN") {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: moneda,
            minimumFractionDigits: 2
        }).format(amount || 0);
    }

    loadCotizaciones();

})();