(() => {
    // Vista de órdenes de servicio: listado, filtros, alta/edición y navegación a detalle.
    const table = document.getElementById("serviceOrdersTable");
    const cards = document.getElementById("serviceOrdersCards");
    const searchInput = document.getElementById("soSearch");
    const combinedFilter = document.getElementById("soCombinedFilter");
    const dateFrom = document.getElementById("soDateFrom");
    const dateTo = document.getElementById("soDateTo");
    const openAddBtn = document.getElementById("openAddSO");

    const form = document.getElementById("serviceOrderForm");
    const modalTitle = document.getElementById("serviceOrderModalTitle");
    const soId = document.getElementById("soId");
    const soProspect = document.getElementById("soProspect");
    const soTicket = document.getElementById("soTicket");
    const soServiceType = document.getElementById("soServiceType");
    const soAssignedUser = document.getElementById("soAssignedUser");
    const soPriority = document.getElementById("soPriority");
    const soStatus = document.getElementById("soStatus");
    const soStartDate = document.getElementById("soStartDate");
    const soEstimatedDelivery = document.getElementById("soEstimatedDelivery");
    const soDescription = document.getElementById("soDescription");
    const soAttachment = document.getElementById("soAttachment");

    const orderModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("serviceOrderModal"));

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let ordersCache = [];
    let clientsCache = [];
    let ticketsCache = [];
    let usersCache = [];
    const TABLE_PAGE_SIZE = 9;
    const CARD_PAGE_SIZE = 5;
    let currentPage = 1;
    const paginationContainer = ensurePaginationContainer(table, "serviceOrdersPagination");

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

    function capitalize(value) {
        const text = String(value || "");
        if (!text) return "-";
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function formatDate(dateValue) {
        if (!dateValue) return "-";
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return "-";
        return date.toLocaleDateString("es-MX");
    }

    function formatDateTime(dateValue) {
        if (!dateValue) return "-";
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return "-";
        return `${date.toLocaleDateString("es-MX")} ${date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`;
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

    function getStatusBadgeMarkup(status) {
        const clean = String(status || "").toLowerCase();
        return `<span class="badge ${getBadgeClassStatus(clean)}">${escapeHTML(capitalize(clean))}</span>`;
    }

    function getPriorityBadgeMarkup(priority) {
        const clean = String(priority || "").toLowerCase();
        return `<span class="badge ${getBadgeClassPriority(clean)}">${escapeHTML(capitalize(clean))}</span>`;
    }

    function buildAttachmentUrl(rawPath) {
        const text = String(rawPath || "").trim();
        if (!text) return "";

        if (/^https?:\/\//i.test(text)) {
            return text;
        }

        let normalized = text.replace(/\\/g, "/");
        normalized = normalized.replace(/^\/+/, "");

        if (!normalized.startsWith("server/uploads/")) {
            normalized = `server/uploads/${normalized.replace(/^uploads\//, "")}`;
        }

        return `/${encodeURI(normalized)}`;
    }

    function normalizeAttachmentList(rawAttachments, fallbackAttachment = null) {
        const unique = new Set();

        function pushValue(value) {
            if (value === null || value === undefined) return;

            if (Array.isArray(value)) {
                value.forEach(pushValue);
                return;
            }

            const text = String(value).trim();
            if (!text) return;

            if (text.startsWith("[") && text.endsWith("]")) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(pushValue);
                        return;
                    }
                } catch {
                    // Ignore parse errors and preserve raw string.
                }
            }

            unique.add(text);
        }

        pushValue(rawAttachments);
        pushValue(fallbackAttachment);

        return Array.from(unique);
    }

    function getAttachmentMarkup(attachmentPath) {
        if (!attachmentPath) return "";

        const safePath = String(attachmentPath || "");
        const attachmentUrl = buildAttachmentUrl(safePath);
        if (!attachmentUrl) return "";

        const normalized = safePath.toLowerCase();
        const imageExt = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"];
        const isImage = imageExt.some((ext) => normalized.endsWith(ext));
        const isPdf = normalized.endsWith(".pdf");

        if (isImage) {
            return `
                <div class="mt-2">
                    <a href="${attachmentUrl}" target="_blank" rel="noopener">
                        <img src="${attachmentUrl}" alt="Adjunto" class="img-fluid rounded border" style="max-height: 260px; object-fit: contain;">
                    </a>
                </div>
            `;
        }

        if (isPdf) {
            return `<div class="mt-2"><a href="${attachmentUrl}" target="_blank" rel="noopener">Ver PDF adjunto</a></div>`;
        }

        return `<div class="mt-2"><a href="${attachmentUrl}" target="_blank" rel="noopener">Ver adjunto</a></div>`;
    }

    function getAttachmentsMarkup(rawAttachments, fallbackAttachment = null) {
        const attachments = normalizeAttachmentList(rawAttachments, fallbackAttachment);
        if (!attachments.length) return "";

        return attachments.map((attachmentPath) => getAttachmentMarkup(attachmentPath)).join("");
    }

    function historyFieldLabel(fieldName) {
        const map = {
            id_ticket: "ticket",
            id_prospect: "cliente",
            id_assigned_user: "usuario asignado",
            service_type: "tipo de servicio",
            description: "descripcion",
            priority: "prioridad",
            status: "estatus",
            start_date: "fecha de inicio",
            estimated_delivery: "fecha estimada de entrega",
            response: "respuesta"
        };

        return map[String(fieldName || "")] || "orden de servicio";
    }

    function historyDescription(item) {
        const field = String(item?.field_changed || "");
        const label = historyFieldLabel(field);
        const oldValue = item?.old_value === null || item?.old_value === undefined || item?.old_value === "" ? "sin valor" : String(item.old_value);
        const newValue = item?.new_value === null || item?.new_value === undefined || item?.new_value === "" ? "sin valor" : String(item.new_value);

        if (field === "response") {
            return "Se agrego una respuesta";
        }

        return item?.description || `Cambio de ${label}: ${oldValue} -> ${newValue}`;
    }

    function openTicketConversation(ticketId) {
        const safeId = Number(ticketId || 0);
        if (!safeId) return;

        window.pendingTicketConversationId = safeId;
        sessionStorage.setItem("pendingTicketConversationId", String(safeId));

        if (typeof loadView === "function") {
            loadView("views/ticketsSupport.html", "css/ticketsSupport.css", "js/ticketsSupport.js");
        }
    }

    function renderTable(data) {
        const useCards = isMobileVerticalView();
        const pageSize = getCurrentPageSize();

        if (cards) {
            cards.style.display = useCards ? "block" : "none";
        }

        if (!Array.isArray(data) || !data.length) {
            table.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-4">No se encontraron órdenes de servicio</td>
            </tr>
        `;
            if (cards) {
                cards.innerHTML = `<div class="text-center text-muted py-4">No se encontraron órdenes de servicio</div>`;
            }
            renderPagination(0, data || []);
            return;
        }

        const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
        if (currentPage > totalPages) {
            currentPage = totalPages;
        }

        const start = (currentPage - 1) * pageSize;
        const paginatedData = data.slice(start, start + pageSize);

        if (useCards) {
            table.innerHTML = "";
            cards.innerHTML = paginatedData.map((order) => `
                <div class="service-order-card">
                    <div class="service-order-card-title">${escapeHTML(order.order_number || "-")}</div>
                    <div class="service-order-card-meta">Cliente: ${escapeHTML(order.cliente || order.prospecto || "-")}</div>
                    <div class="service-order-card-meta">Ticket: ${order.id_ticket
                    ? `<button class="btn btn-link p-0 text-decoration-none open-ticket" data-ticket-id="${order.id_ticket}">${escapeHTML(order.ticket_number || "-")}</button>`
                    : "-"}</div>
                    <div class="service-order-card-meta">Asignado a: ${escapeHTML(order.assigned_user || "-")}</div>
                    <div class="service-order-card-meta">Tipo de servicio: ${escapeHTML(order.service_type || "-")}</div>
                    <div class="service-order-card-meta">Prioridad: ${getPriorityBadgeMarkup(order.priority)}</div>
                    <div class="service-order-card-meta">Estatus: ${getStatusBadgeMarkup(order.status)}</div>
                    <div class="service-order-card-meta">Fecha: ${formatDate(order.created_at)}</div>
                    <div class="service-order-card-actions mt-2">
                        <button class="btn btn-sm btn-outline-primary view-btn" data-id="${order.id_service_order}">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${order.id_service_order}">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${order.id_service_order}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `).join("");

            renderPagination(data.length, data);
            return;
        }

        table.innerHTML = paginatedData.map((order) => `
        <tr>
            <td>${escapeHTML(order.order_number)}</td>
            <td>${escapeHTML(order.cliente || order.prospecto || "-")}</td>
            <td>
                ${order.id_ticket
                ? `<button class="btn btn-link p-0 text-decoration-none open-ticket" data-ticket-id="${order.id_ticket}">${escapeHTML(order.ticket_number || "-")}</button>`
                : "-"}
            </td>
            <td>${escapeHTML(order.assigned_user || "-")}</td>
            <td>${escapeHTML(order.service_type || "-")}</td>
            <td><span class="badge ${getBadgeClassPriority(order.priority)}">${escapeHTML(capitalize(order.priority))}</span></td>
            <td><span class="badge ${getBadgeClassStatus(order.status)}">${escapeHTML(capitalize(order.status))}</span></td>
            <td class="text-end">${formatDate(order.created_at)}</td>
            <td class="text-end">
                <div class="service-order-row-actions">
                    <button class="btn btn-sm btn-outline-primary view-btn" data-id="${order.id_service_order}">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${order.id_service_order}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${order.id_service_order}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join("");

        renderPagination(data.length, data);
    }

    async function loadProspects() {
        const [clientsRes, ticketsRes, usersRes] = await Promise.all([
            apiFetch("/api/clients"),
            apiFetch("/api/tickets"),
            apiFetch("/api/users")
        ]);

        const [clientsPayload, ticketsPayload, usersPayload] = await Promise.all([
            clientsRes.json(),
            ticketsRes.json(),
            usersRes.json()
        ]);

        if (!clientsRes.ok || !clientsPayload.success) {
            throw new Error(clientsPayload.message || "No se pudieron cargar clientes");
        }

        if (!ticketsRes.ok || !ticketsPayload.success) {
            throw new Error(ticketsPayload.message || "No se pudieron cargar tickets");
        }

        if (!usersRes.ok || !usersPayload.success) {
            throw new Error(usersPayload.message || "No se pudieron cargar usuarios");
        }

        clientsCache = clientsPayload.data || [];
        ticketsCache = ticketsPayload.data || [];
        usersCache = usersPayload.data || [];

        soProspect.innerHTML = `
        <option value="">Seleccionar cliente</option>
        ${clientsCache
                .map((client) => `<option value="${client.id_client}">${escapeHTML(client.company)}</option>`)
                .join("")}
    `;

        soTicket.innerHTML = `
        <option value="">Sin ticket</option>
        ${ticketsCache
                .map((ticket) => `<option value="${ticket.id_ticket}">${escapeHTML(ticket.ticket_number)} - ${escapeHTML(ticket.subject || "")}</option>`)
                .join("")}
        `;

        soAssignedUser.innerHTML = `
        <option value="">Sin asignar</option>
        ${usersCache
                .map((user) => `<option value="${user.id}">${escapeHTML(user.name || user.username || "Usuario")}</option>`)
                .join("")}
        `;
    }

    async function loadOrders() {
        const params = new URLSearchParams();

        const search = searchInput.value.trim();
        const combined = combinedFilter.value;
        const from = dateFrom.value;
        const to = dateTo.value;

        if (search) params.append("search", search);

        if (combined.startsWith("status:")) {
            params.append("status", combined.slice(7));
        } else if (combined.startsWith("priority:")) {
            params.append("priority", combined.slice(9));
        }

        if (from) params.append("date_from", from);
        if (to) params.append("date_to", to);

        const response = await apiFetch(`/api/service-orders?${params.toString()}`);
        const payload = await response.json();

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudieron cargar órdenes de servicio");
        }

        ordersCache = payload.data || [];
        currentPage = 1;
        renderTable(ordersCache);
    }

    function resetForm() {
        form.reset();
        soId.value = "";
        soTicket.value = "";
        soAssignedUser.value = "";
        soPriority.value = "medio";
        soStatus.value = "pendiente";
        if (soAttachment) soAttachment.value = "";
        modalTitle.textContent = "Nueva Orden de Servicio";
    }

    function fillForm(order) {
        soId.value = order.id_service_order;
        soProspect.value = String(order.id_prospect || "");
        soTicket.value = order.id_ticket ? String(order.id_ticket) : "";
        soServiceType.value = order.service_type || "";
        soAssignedUser.value = order.id_assigned_user ? String(order.id_assigned_user) : "";
        soPriority.value = String(order.priority || "medio").toLowerCase();
        soStatus.value = String(order.status || "pendiente").toLowerCase();
        soStartDate.value = order.start_date ? String(order.start_date).split("T")[0] : "";
        soEstimatedDelivery.value = order.estimated_delivery ? String(order.estimated_delivery).split("T")[0] : "";
        soDescription.value = order.description || "";
        if (soAttachment) soAttachment.value = "";
        modalTitle.textContent = "Editar Orden de Servicio";
    }

    async function saveOrder(event) {
        event.preventDefault();

        const id = soId.value;

        const payload = {
            id_ticket: soTicket.value ? Number(soTicket.value) : null,
            id_prospect: Number(soProspect.value),
            id_created_by: getLoggedUserId(),
            id_assigned_user: soAssignedUser.value ? Number(soAssignedUser.value) : null,
            service_type: soServiceType.value.trim(),
            description: soDescription.value.trim() || null,
            priority: soPriority.value,
            status: soStatus.value,
            start_date: soStartDate.value || null,
            estimated_delivery: soEstimatedDelivery.value || null,
            id_user: getLoggedUserId()
        };

        if (!payload.id_prospect || !payload.service_type) {
            await showAlert("Cliente y tipo de servicio son obligatorios");
            return;
        }

        const endpoint = id ? `/api/service-orders/${id}` : "/api/service-orders";
        const method = id ? "PUT" : "POST";

        let response;
        if (method === "POST") {
            const formData = new FormData();

            Object.entries(payload).forEach(([key, value]) => {
                if (value === null || value === undefined || value === "") return;
                formData.append(key, String(value));
            });

            for (const file of Array.from(soAttachment?.files || [])) {
                formData.append("attachments", file);
            }

            response = await apiFetch(endpoint, {
                method,
                body: formData
            });
        } else {
            response = await apiFetch(endpoint, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
            throw new Error(result.message || "No se pudo guardar la orden");
        }

        orderModal.hide();
        await loadOrders();
    }

    async function openDetail(id) {
        window.currentServiceOrderDetailId = Number(id || 0) || null;
        if (typeof loadView === "function") {
            loadView("views/serviceOrderDetail.html", "css/serviceOrderDetail.css", "js/serviceOrderDetail.js");
        }
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

        combinedFilter.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        dateFrom.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        dateTo.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        async function handleServiceOrderActions(event) {
            const viewBtn = event.target.closest(".view-btn");
            const editBtn = event.target.closest(".edit-btn");
            const deleteBtn = event.target.closest(".delete-btn");
            const openTicketBtn = event.target.closest(".open-ticket");

            try {
                if (openTicketBtn) {
                    openTicketConversation(openTicketBtn.dataset.ticketId);
                    return;
                }

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
        }

        table.addEventListener("click", handleServiceOrderActions);
        cards?.addEventListener("click", handleServiceOrderActions);

        window.addEventListener("app:resize", () => renderTable(ordersCache));
        window.addEventListener("resize", () => renderTable(ordersCache));
        window.addEventListener("orientationchange", () => {
            setTimeout(() => renderTable(ordersCache), 200);
        });

        Promise.all([loadProspects(), loadOrders()]).catch(async (error) => {
            table.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
            </tr>
        `;
        });
    }
})();