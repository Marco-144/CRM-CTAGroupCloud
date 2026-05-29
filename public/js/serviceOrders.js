(() => {
    // Vista de órdenes de servicio: listado, filtros, alta/edición y navegación a detalle.
    const board = document.getElementById("serviceOrdersBoard");
    const searchInput = document.getElementById("soSearch");
    const statusFilter = document.getElementById("soStatusFilter");
    const priorityFilter = document.getElementById("soPriorityFilter");
    const dateFrom = document.getElementById("soDateFrom");
    const dateTo = document.getElementById("soDateTo");
    const filtersToggleBtn = document.getElementById("serviceOrdersFiltersToggleBtn");
    const filtersPanel = document.getElementById("serviceOrdersFiltersPanel");
    const openAddBtn = document.getElementById("openAddSO");

    const form = document.getElementById("serviceOrderForm");
    const modalTitle = document.getElementById("serviceOrderModalTitle");
    const soId = document.getElementById("soId");
    const soProspect = document.getElementById("soProspect");
    const soTicket = document.getElementById("soTicket");
    const soServiceType = document.getElementById("soServiceType");
    const soAssignedUsersContainer = document.getElementById("soAssignedUsersContainer");
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
    let currentPage = 1;
    const paginationContainer = null;

    const STATUS_COLUMNS = [
        { key: "pendiente", label: "Pendientes", badgeClass: "bg-secondary" },
        { key: "activa", label: "Activas", badgeClass: "bg-primary" },
        { key: "completada", label: "Completadas", badgeClass: "bg-success" },
        { key: "cancelada", label: "Canceladas", badgeClass: "bg-danger" },
    ];

    const PRIORITY_RANK = {
        urgente: 0,
        alto: 1,
        medio: 2,
        bajo: 3,
    };

    const COLUMN_PAGE_SIZE = 3;
    const columnPageState = {
        pendiente: 1,
        activa: 1,
        completada: 1,
        cancelada: 1,
    };

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

    function normalizeStatusValue(status) {
        return String(status || "").toLowerCase().trim();
    }

    function getPriorityRank(priority) {
        const key = String(priority || "").toLowerCase().trim();
        return PRIORITY_RANK[key] ?? 99;
    }

    function sortOrdersForBoard(items) {
        return Array.from(items || []).sort((left, right) => {
            const priorityDiff = getPriorityRank(left.priority) - getPriorityRank(right.priority);
            if (priorityDiff !== 0) return priorityDiff;

            const leftDate = new Date(left.created_at || 0).getTime();
            const rightDate = new Date(right.created_at || 0).getTime();
            return rightDate - leftDate;
        });
    }

    function getColumnPage(columnKey, totalPages) {
        const current = Number(columnPageState[columnKey] || 1);
        const maxPage = Math.max(1, Number(totalPages || 1));
        return Math.min(Math.max(current, 1), maxPage);
    }

    function setColumnPage(columnKey, nextPage, totalPages) {
        const maxPage = Math.max(1, Number(totalPages || 1));
        columnPageState[columnKey] = Math.min(Math.max(Number(nextPage) || 1, 1), maxPage);
    }

    function buildOrderCard(order) {
        const canEdit = Boolean(order.can_edit);
        const canDelete = Boolean(order.can_delete);

        return `
            <article class="service-order-kanban-card">
                <div class="service-order-kanban-head">
                    <div class="service-order-kanban-folio">${escapeHTML(order.order_number || "-")}</div>
                    <span class="badge ${getBadgeClassPriority(order.priority)}">${escapeHTML(capitalize(order.priority))}</span>
                </div>
                <div class="service-order-kanban-meta">
                    <span class="service-order-kanban-label">Cliente</span>
                    <span class="service-order-kanban-value">${escapeHTML(order.cliente || order.prospecto || "-")}</span>
                </div>
                <div class="service-order-kanban-meta">
                    <span class="service-order-kanban-label">Tipo de servicio</span>
                    <span class="service-order-kanban-value">${escapeHTML(order.service_type || "-")}</span>
                </div>
                <div class="service-order-kanban-meta">
                    <span class="service-order-kanban-label">Fecha</span>
                    <span class="service-order-kanban-value">${escapeHTML(formatDate(order.created_at))}</span>
                </div>
                <div class="service-order-kanban-actions">
                    <button class="btn btn-sm btn-outline-primary view-btn" data-id="${order.id_service_order}">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${canEdit ? `<button class="btn btn-sm btn-outline-secondary edit-btn" data-id="${order.id_service_order}"><i class="bi bi-pencil"></i></button>` : ""}
                    ${canDelete ? `<button class="btn btn-sm btn-outline-danger delete-btn" data-id="${order.id_service_order}"><i class="bi bi-trash"></i></button>` : ""}
                </div>
            </article>
        `;
    }

    function renderBoard(data) {
        if (!board) return;

        const rows = Array.isArray(data) ? data : [];
        const grouped = new Map(STATUS_COLUMNS.map((column) => [column.key, []]));

        for (const order of rows) {
            const key = normalizeStatusValue(order.status);
            if (!grouped.has(key)) {
                continue;
            }

            grouped.get(key).push(order);
        }

        board.innerHTML = STATUS_COLUMNS.map((column) => {
            const items = sortOrdersForBoard(grouped.get(column.key) || []);
            const totalPages = Math.max(1, Math.ceil(items.length / COLUMN_PAGE_SIZE));
            const currentPage = getColumnPage(column.key, totalPages);
            const start = (currentPage - 1) * COLUMN_PAGE_SIZE;
            const pageItems = items.slice(start, start + COLUMN_PAGE_SIZE);
            const pageStart = items.length ? start + 1 : 0;
            const pageEnd = Math.min(start + COLUMN_PAGE_SIZE, items.length);

            return `
                <section class="service-orders-column">
                    <div class="service-orders-column-header">
                        <div>
                            <h5 class="mb-0">${column.label}</h5>
                            <small class="text-muted">${items.length} orden(es)</small>
                        </div>
                        <span class="badge ${column.badgeClass}">${items.length}</span>
                    </div>
                    <div class="service-orders-column-body">
                        ${items.length ? pageItems.map((order) => buildOrderCard(order)).join("") : `<div class="service-orders-empty">Sin órdenes</div>`}
                    </div>
                    ${items.length > COLUMN_PAGE_SIZE ? `
                        <div class="service-orders-column-footer">
                            <small class="text-muted">${pageStart}-${pageEnd} de ${items.length}</small>
                            <div class="service-orders-column-pagination">
                                <button type="button" class="btn btn-sm btn-outline-secondary service-orders-column-page-btn" data-column-key="${column.key}" data-page-action="prev" ${currentPage <= 1 ? "disabled" : ""}>
                                    <i class="bi bi-chevron-left"></i>
                                </button>
                                <span class="small text-muted">${currentPage}/${totalPages}</span>
                                <button type="button" class="btn btn-sm btn-outline-secondary service-orders-column-page-btn" data-column-key="${column.key}" data-page-action="next" ${currentPage >= totalPages ? "disabled" : ""}>
                                    <i class="bi bi-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    ` : ""}
                </section>
            `;
        }).join("");
    }

    function normalizeAssignedUserValues(values) {
        return Array.from(new Set((Array.isArray(values) ? values : [])
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)));
    }

    function getAssignedUserSelects() {
        return Array.from(soAssignedUsersContainer?.querySelectorAll(".so-assigned-user-select") || []);
    }

    function getAssignedUserRowValues() {
        return getAssignedUserSelects().map((select) => String(select.value || ""));
    }

    function getAssignedUserIdsFromRows() {
        return normalizeAssignedUserValues(getAssignedUserRowValues());
    }

    function buildAssignedUserOptions(currentValue, excludedValues) {
        const current = String(currentValue || "");
        const excluded = new Set((Array.isArray(excludedValues) ? excludedValues : []).map((value) => String(value)));

        const options = [`<option value="">Selecciona un usuario</option>`];
        usersCache.forEach((user) => {
            const value = String(user.id);
            if (value !== current && excluded.has(value)) {
                return;
            }

            options.push(`
                <option value="${value}" ${value === current ? "selected" : ""}>
                    ${escapeHTML(user.name || user.username || "Usuario")}
                </option>
            `);
        });

        return options.join("");
    }

    function renderAssignedUserRows(rowValues = [""]) {
        if (!soAssignedUsersContainer) return;

        const values = Array.isArray(rowValues) && rowValues.length ? rowValues.map((value) => String(value || "")) : [""];

        soAssignedUsersContainer.innerHTML = values.map((value, index) => `
            <div class="row g-2 align-items-center service-order-assigned-row" data-row-index="${index}">
                <div class="col">
                    <select class="form-select so-assigned-user-select" data-row-index="${index}"></select>
                </div>
                <div class="col-auto">
                    <button type="button" class="btn btn-outline-primary btn-sm so-assigned-user-add-btn" data-row-index="${index}" aria-label="Agregar usuario">
                        <i class="bi bi-plus-lg"></i>
                    </button>
                    ${values.length > 1 ? `
                        <button type="button" class="btn btn-outline-danger btn-sm so-assigned-user-remove-btn ms-1" data-row-index="${index}" aria-label="Quitar usuario">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ""}
                </div>
            </div>
        `).join("");

        refreshAssignedUserRows(values);
    }

    function refreshAssignedUserRows(preservedValues = null) {
        if (!soAssignedUsersContainer) return;

        const rowValues = Array.isArray(preservedValues) ? preservedValues.map((value) => String(value || "")) : getAssignedUserRowValues();
        const selectedValues = rowValues.filter(Boolean);

        getAssignedUserSelects().forEach((select, index) => {
            const currentValue = rowValues[index] || "";
            const excludedValues = selectedValues.filter((value) => value !== currentValue);
            select.innerHTML = buildAssignedUserOptions(currentValue, excludedValues);
            select.value = currentValue;
        });

        const rows = Array.from(soAssignedUsersContainer.querySelectorAll(".service-order-assigned-row"));
        rows.forEach((row, index) => {
            const isLastRow = index === rows.length - 1;
            row.querySelectorAll(".so-assigned-user-add-btn").forEach((button) => {
                button.classList.toggle("d-none", !isLastRow);
            });
            row.querySelectorAll(".so-assigned-user-remove-btn").forEach((button) => {
                button.classList.toggle("d-none", rows.length <= 1);
            });
        });
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
        renderBoard(data);
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

        refreshAssignedUserRows();

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

    }

    async function loadOrders() {
        const params = new URLSearchParams();

        const search = searchInput.value.trim();
        const status = statusFilter?.value || "";
        const priority = priorityFilter?.value || "";
        const from = dateFrom.value;
        const to = dateTo.value;

        if (search) params.append("search", search);

        if (status) params.append("status", status);
        if (priority) params.append("priority", priority);

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
        renderAssignedUserRows([""]);
        soPriority.value = "medio";
        soStatus.value = "pendiente";
        if (soAttachment) soAttachment.value = "";
        modalTitle.textContent = "Nueva Orden de Servicio";
    }

    function setAssignedUsers(userIds) {
        const normalized = normalizeAssignedUserValues(userIds);
        renderAssignedUserRows(normalized.length ? normalized.map(String) : [""]);
    }

    function fillForm(order) {
        soId.value = order.id_service_order;
        soProspect.value = String(order.id_prospect || "");
        soTicket.value = order.id_ticket ? String(order.id_ticket) : "";
        soServiceType.value = order.service_type || "";
        setAssignedUsers(order.assigned_user_ids || (order.id_assigned_user ? [order.id_assigned_user] : []));
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
            id_assigned_user: getAssignedUserIdsFromRows()[0] || null,
            assigned_user_ids: JSON.stringify(getAssignedUserIdsFromRows()),
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

        const assignedUserIds = getAssignedUserIdsFromRows();
        if (assignedUserIds.length > 0) {
            payload.id_assigned_user = assignedUserIds[0];
            payload.assigned_user_ids = JSON.stringify(assignedUserIds);
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

    if (board && form) {
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

        function setFiltersPanelVisible(visible) {
            if (!filtersPanel) return;

            filtersPanel.classList.toggle("d-none", !visible);
            filtersPanel.setAttribute("aria-hidden", String(!visible));
            filtersToggleBtn?.setAttribute("aria-expanded", visible ? "true" : "false");
        }

        filtersToggleBtn?.addEventListener("click", () => {
            const isHidden = filtersPanel?.classList.contains("d-none") ?? true;
            setFiltersPanelVisible(isHidden);
        });

        soAssignedUsersContainer?.addEventListener("click", (event) => {
            const addBtn = event.target.closest(".so-assigned-user-add-btn");
            const removeBtn = event.target.closest(".so-assigned-user-remove-btn");

            if (addBtn) {
                const values = getAssignedUserRowValues();
                values.push("");
                renderAssignedUserRows(values);
                return;
            }

            if (removeBtn) {
                const row = removeBtn.closest(".service-order-assigned-row");
                const rows = Array.from(soAssignedUsersContainer.querySelectorAll(".service-order-assigned-row"));
                const index = rows.indexOf(row);
                if (index >= 0) {
                    const values = getAssignedUserRowValues();
                    values.splice(index, 1);
                    renderAssignedUserRows(values.length ? values : [""]);
                }
            }
        });

        soAssignedUsersContainer?.addEventListener("change", (event) => {
            if (event.target.matches(".so-assigned-user-select")) {
                refreshAssignedUserRows();
            }
        });

        board?.addEventListener("click", (event) => {
            const pageBtn = event.target.closest(".service-orders-column-page-btn");
            if (!pageBtn) return;

            const columnKey = String(pageBtn.dataset.columnKey || "");
            const action = String(pageBtn.dataset.pageAction || "");
            const items = sortOrdersForBoard((ordersCache || []).filter((order) => normalizeStatusValue(order.status) === columnKey));
            const totalPages = Math.max(1, Math.ceil(items.length / COLUMN_PAGE_SIZE));
            const currentPage = getColumnPage(columnKey, totalPages);
            const nextPage = action === "next" ? currentPage + 1 : currentPage - 1;

            setColumnPage(columnKey, nextPage, totalPages);
            renderTable(ordersCache);
        });

        searchInput.addEventListener("input", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        statusFilter?.addEventListener("change", () => {
            loadOrders().catch((error) => showAlert(error.message));
        });

        priorityFilter?.addEventListener("change", () => {
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
                    if (!order || !order.can_edit) {
                        await showAlert("Solo el creador puede editar la orden de servicio");
                        return;
                    }

                    await loadProspects();
                    fillForm(order);
                    orderModal.show();
                    return;
                }

                if (deleteBtn) {
                    const order = ordersCache.find((item) => Number(item.id_service_order) === Number(deleteBtn.dataset.id));
                    if (!order || !order.can_delete) {
                        await showAlert("Solo el creador puede eliminar la orden de servicio");
                        return;
                    }
                    await deleteOrder(deleteBtn.dataset.id);
                }
            } catch (error) {
                await showAlert(error.message);
            }
        }

        board?.addEventListener("click", handleServiceOrderActions);

        window.addEventListener("app:resize", () => renderTable(ordersCache));
        window.addEventListener("resize", () => renderTable(ordersCache));
        window.addEventListener("orientationchange", () => {
            setTimeout(() => renderTable(ordersCache), 200);
        });

        Promise.all([loadProspects(), loadOrders()]).catch(async (error) => {
            if (board) {
                board.innerHTML = `<div class="service-orders-empty service-orders-empty-error text-danger">${escapeHTML(error.message)}</div>`;
            }
        });
    }
})();