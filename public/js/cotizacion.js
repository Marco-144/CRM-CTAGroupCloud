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

    let cotizacionesCache = [];
    let filteredData = [];
    let currentViewId = null;


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

        renderTable(filteredData);
        updateKpis(filteredData);
    }

    async function filtrarPorPeriodicidad(tipo) {

        if (tipo === "periodicidad_all") {
            filteredData = applyBaseFilters(cotizacionesCache);
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
        renderTable(filteredData);
        updateKpis(filteredData);
    }

    function applyBaseFilters(sourceData) {
        const searchTerm = (cotizacionSearch?.value || "").trim().toLowerCase();
        const selectedDate = cotizacionDateFilter?.value || "";
        const activeFilter = cotizacionFilter?.value || "";

        const statusMap = {
            status_activo: "Activo",
            status_inactivo: "Inactivo"
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
            return;
        }

        cotizacionesTable.innerHTML = data.map(item => {
            const folio = String(item.Folio ?? item.folio ?? 0).padStart(5, "0");
            const isInactive = item.status === "Inactivo";
            const isCompleted = item.status === "Completada";

            return `
        <tr>
            <td class="text-center">${folio}</td>
            <td>${item.prospecto}</td>
            <td>
                ${isCompleted
                    ? `<span class="badge bg-primary">${item.status || "Activo"}</span>`
                    : `<button class="btn btn-sm p-0 border-0 bg-transparent status-inline-btn" data-id="${item.id_cotizacion}" title="Cambiar estatus">
                        <span class="badge ${isInactive
                        ? "bg-secondary"
                        : "bg-success"
                    }">
                    ${item.status || "Activo"}
                </span>
                    </button>`}
            </td>
            <td class="text-center">${item.total_cantidad || 0}</td>
            <td class="text-center">${formatMoney(item.subtotal)}</td>
            <td class="fw-semibold text-center">${formatMoney(item.total)}</td>
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

                <button class="btn btn-sm btn-outline-success me-2 complete-sale-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-bag-check"></i>
                </button>

                <button class="btn btn-sm btn-outline-danger me-2 delete-btn"
                    data-id="${item.id_cotizacion}">
                    <i class="bi bi-trash"></i>
                </button>

                <button class="btn btn-sm btn-outline-primary pdf-btn ${isInactive ? "disabled" : ""}"
                    data-id="${item.id_cotizacion}"
                    ${isInactive ? "disabled title='Cotización inactiva: PDF no disponible'" : ""}>
                    <i class="bi bi-filetype-pdf"></i>
                </button>

            </td>
        </tr>
    `;
        }).join("");
    }

    /* ============================
       KPIs
    ============================ */
    function updateKpis(data = filteredData) {

        const total = data.reduce(
            (acc, item) => acc + Number(item.total || 0),
            0
        );

        const cantidad = data.reduce(
            (acc, item) => acc + Number(item.total_cantidad || 0),
            0
        );

        totalCotizaciones.textContent = data.length;
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

        toggleFromDetailBtn.textContent = cot.status === "Inactivo"
            ? "Activar cotización"
            : "Desactivar cotización";

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
        const confirmed = await showConfirm("¿Deseas completar esta cotización como venta?");
        if (!confirmed) return;

        const res = await apiFetch(`/api/cotizaciones/${id}/complete`, {
            method: "PATCH"
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
            await showAlert(data.message || "No se pudo completar la venta");
            return;
        }

        await showAlert("Venta completada correctamente");
        await loadCotizaciones();
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

    function downloadPDF(id) {
        window.open(`/api/cotizaciones/${id}/pdf`, "_blank");
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