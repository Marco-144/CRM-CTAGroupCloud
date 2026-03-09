(() => {
    const table = document.getElementById("serviceOrdersTable");
    const searchInput = document.getElementById("soSearch");
    const statusFilter = document.getElementById("soStatusFilter");
    const priorityFilter = document.getElementById("soPriorityFilter");
    const openAddBtn = document.getElementById("openAddSO");

    const form = document.getElementById("serviceOrderForm");
    const modalTitle = document.getElementById("serviceOrderModalTitle");
    const soId = document.getElementById("soId");
    const soProspect = document.getElementById("soProspect");
    const soServiceType = document.getElementById("soServiceType");
    const soPriority = document.getElementById("soPriority");
    const soStatus = document.getElementById("soStatus");
    const soStartDate = document.getElementById("soStartDate");
    const soEstimatedDelivery = document.getElementById("soEstimatedDelivery");
    const soDescription = document.getElementById("soDescription");

    const detailBody = document.getElementById("viewSOBody");

    const orderModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("serviceOrderModal"));
    const viewModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("viewSOModal"));

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let ordersCache = [];
    let prospectsCache = [];

    function getLoggedUserId() {
        try {
            const user = JSON.parse(sessionStorage.getItem("loggedUserData") || "{}");
            return Number(user.id || 1);
        } catch {
            return 1;
        }
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatDate(dateValue) {
        if (!dateValue) return "-";
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleDateString("es-MX");
    }

    function capitalize(value) {
        const text = String(value || "");
        if (!text) return "-";
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function getBadgeClassStatus(status) {
        const map = {
            pendiente: "bg-secondary",
            activa: "bg-primary",
            completada: "bg-success",
            cancelada: "bg-danger"
        };
        return map[String(status || "").toLowerCase()] || "bg-secondary";
    }

    function getBadgeClassPriority(priority) {
        const map = {
            bajo: "bg-secondary",
            medio: "bg-warning text-dark",
            alto: "bg-danger",
            urgente: "bg-dark"
        };
        return map[String(priority || "").toLowerCase()] || "bg-secondary";
    }

    function renderTable(data) {
        if (!Array.isArray(data) || !data.length) {
            table.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted py-4">No se encontraron órdenes de servicio</td>
            </tr>
        `;
            return;
        }

        table.innerHTML = data.map((order) => `
        <tr>
            <td>${escapeHTML(order.order_number)}</td>
            <td>${escapeHTML(order.prospecto || "-")}</td>
            <td>${escapeHTML(order.service_type || "-")}</td>
            <td><span class="badge ${getBadgeClassPriority(order.priority)}">${escapeHTML(capitalize(order.priority))}</span></td>
            <td><span class="badge ${getBadgeClassStatus(order.status)}">${escapeHTML(capitalize(order.status))}</span></td>
            <td class="text-center">${Number(order.total_tickets || 0)}</td>
            <td class="text-end">${formatDate(order.created_at)}</td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-primary me-2 view-btn" data-id="${order.id_service_order}">
                    <i class="bi bi-eye"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary me-2 edit-btn" data-id="${order.id_service_order}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${order.id_service_order}">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join("");
    }

    async function loadProspects() {
        const response = await apiFetch("/api/prospects?status=Activo");
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudieron cargar prospectos");
        }

        prospectsCache = payload.data || [];

        soProspect.innerHTML = `
        <option value="">Seleccionar prospecto</option>
        ${prospectsCache
                .map((prospect) => `<option value="${prospect.id_prospect}">${escapeHTML(prospect.company)}</option>`)
                .join("")}
    `;
    }

    async function loadOrders() {
        const params = new URLSearchParams();

        const search = searchInput.value.trim();
        const status = statusFilter.value;
        const priority = priorityFilter.value;

        if (search) params.append("search", search);
        if (status) params.append("status", status);
        if (priority) params.append("priority", priority);

        const response = await apiFetch(`/api/service-orders?${params.toString()}`);
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudieron cargar órdenes de servicio");
        }

        ordersCache = payload.data || [];
        renderTable(ordersCache);
    }

    function resetForm() {
        form.reset();
        soId.value = "";
        soPriority.value = "medio";
        soStatus.value = "pendiente";
        modalTitle.textContent = "Nueva Orden de Servicio";
    }

    function fillForm(order) {
        soId.value = order.id_service_order;
        soProspect.value = String(order.id_prospect || "");
        soServiceType.value = order.service_type || "";
        soPriority.value = String(order.priority || "medio").toLowerCase();
        soStatus.value = String(order.status || "pendiente").toLowerCase();
        soStartDate.value = order.start_date ? String(order.start_date).split("T")[0] : "";
        soEstimatedDelivery.value = order.estimated_delivery ? String(order.estimated_delivery).split("T")[0] : "";
        soDescription.value = order.description || "";
        modalTitle.textContent = "Editar Orden de Servicio";
    }

    async function saveOrder(event) {
        event.preventDefault();

        const id = soId.value;

        const payload = {
            id_prospect: Number(soProspect.value),
            id_created_by: getLoggedUserId(),
            service_type: soServiceType.value.trim(),
            description: soDescription.value.trim() || null,
            priority: soPriority.value,
            status: soStatus.value,
            start_date: soStartDate.value || null,
            estimated_delivery: soEstimatedDelivery.value || null
        };

        if (!payload.id_prospect || !payload.service_type) {
            await showAlert("Prospecto y tipo de servicio son obligatorios");
            return;
        }

        const endpoint = id ? `/api/service-orders/${id}` : "/api/service-orders";
        const method = id ? "PUT" : "POST";

        const response = await apiFetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo guardar la orden");
        }

        orderModal.hide();
        await loadOrders();
    }

    async function openDetail(id) {
        const response = await apiFetch(`/api/service-orders/${id}`);
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudo cargar el detalle");
        }

        const order = payload.data;

        detailBody.innerHTML = `
        <div class="card border-0 shadow-sm mb-3">
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="text-muted small">Folio</div>
                        <div class="fw-semibold">${escapeHTML(order.order_number)}</div>
                    </div>
                    <div class="col-md-6">
                        <div class="text-muted small">Prospecto</div>
                        <div class="fw-semibold">${escapeHTML(order.prospecto || "-")}</div>
                    </div>
                    <div class="col-md-6">
                        <div class="text-muted small">Tipo de servicio</div>
                        <div class="fw-semibold">${escapeHTML(order.service_type || "-")}</div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-muted small">Prioridad</div>
                        <div class="fw-semibold">${escapeHTML(capitalize(order.priority))}</div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-muted small">Estatus</div>
                        <div class="fw-semibold">${escapeHTML(capitalize(order.status))}</div>
                    </div>
                    <div class="col-md-6">
                        <div class="text-muted small">Inicio</div>
                        <div class="fw-semibold">${formatDate(order.start_date)}</div>
                    </div>
                    <div class="col-md-6">
                        <div class="text-muted small">Entrega estimada</div>
                        <div class="fw-semibold">${formatDate(order.estimated_delivery)}</div>
                    </div>
                    <div class="col-12">
                        <div class="text-muted small">Descripción</div>
                        <p class="mb-0">${escapeHTML(order.description || "-")}</p>
                    </div>
                </div>
            </div>
        </div>

        <h6 class="fw-semibold">Tickets relacionados</h6>
        <table class="table table-sm align-middle mb-0">
            <thead>
                <tr>
                    <th>Ticket</th>
                    <th>Asunto</th>
                    <th>Prioridad</th>
                    <th>Estatus</th>
                </tr>
            </thead>
            <tbody>
                ${(order.tickets || []).length
                ? order.tickets.map((ticket) => `
                        <tr>
                            <td>${escapeHTML(ticket.ticket_number)}</td>
                            <td>${escapeHTML(ticket.subject || "-")}</td>
                            <td>${escapeHTML(capitalize(ticket.priority))}</td>
                            <td>${escapeHTML(capitalize(ticket.status))}</td>
                        </tr>
                    `).join("")
                : `<tr><td colspan="4" class="text-center text-muted">Sin tickets</td></tr>`}
            </tbody>
        </table>
    `;

        viewModal.show();
    }

    async function deleteOrder(id) {
        const confirmed = await showConfirm("¿Eliminar esta orden de servicio?");
        if (!confirmed) return;

        const response = await apiFetch(`/api/service-orders/${id}`, { method: "DELETE" });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo eliminar la orden");
        }

        await loadOrders();
    }

    if (table && form) {
        openAddBtn?.addEventListener("click", async () => {
            try {
                resetForm();
                await loadProspects();
                orderModal.show();
            } catch (error) {
                await showAlert(error.message);
            }
        });

        form.addEventListener("submit", async (event) => {
            try {
                await saveOrder(event);
            } catch (error) {
                await showAlert(error.message);
            }
        });

        searchInput.addEventListener("input", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        statusFilter.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        priorityFilter.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        table.addEventListener("click", async (event) => {
            const viewBtn = event.target.closest(".view-btn");
            const editBtn = event.target.closest(".edit-btn");
            const deleteBtn = event.target.closest(".delete-btn");

            try {
                if (viewBtn) {
                    await openDetail(viewBtn.dataset.id);
                    return;
                }

                if (editBtn) {
                    const order = ordersCache.find((item) => Number(item.id_service_order) === Number(editBtn.dataset.id));
                    if (!order) return;

                    await loadProspects();
                    fillForm(order);
                    orderModal.show();
                    return;
                }

                if (deleteBtn) {
                    await deleteOrder(deleteBtn.dataset.id);
                }
            } catch (error) {
                await showAlert(error.message);
            }
        });

        Promise.all([loadProspects(), loadOrders()]).catch(async (error) => {
            table.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
            </tr>
        `;
        });
    }
})();