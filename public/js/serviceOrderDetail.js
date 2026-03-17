(() => {
    // Vista detalle de orden de servicio: metadata, conversación e historial.
    const backBtn = document.getElementById("backToServiceOrders");
    const titleEl = document.getElementById("soDetailTitle");
    const metaEl = document.getElementById("soDetailMeta");
    const responsesList = document.getElementById("soDetailResponsesList");
    const historyList = document.getElementById("soDetailHistoryList");
    const responseForm = document.getElementById("soDetailResponseForm");
    const orderIdInput = document.getElementById("soDetailOrderId");
    const responseMessage = document.getElementById("soDetailResponseMessage");
    const responseAttachment = document.getElementById("soDetailResponseAttachment");
    const openTicketBtn = document.getElementById("soDetailOpenTicketBtn");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));

    // Regresa al listado de órdenes de servicio.
    function goBack() {
        window.currentServiceOrderDetailId = null;
        if (typeof loadView === "function") {
            loadView("views/serviceOrders.html", "css/serviceOrders.css", "js/serviceOrders.js");
        }
    }

    backBtn?.addEventListener("click", goBack);

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
        if (/^https?:\/\//i.test(text)) return text;
        let normalized = text.replace(/\\/g, "/").replace(/^\/+/, "");
        if (!normalized.startsWith("server/uploads/")) {
            normalized = `server/uploads/${normalized.replace(/^uploads\//, "")}`;
        }
        return `/${encodeURI(normalized)}`;
    }

    function normalizeAttachmentList(rawAttachments, fallbackAttachment = null) {
        const unique = new Set();
        function pushValue(value) {
            if (value === null || value === undefined) return;
            if (Array.isArray(value)) { value.forEach(pushValue); return; }
            const text = String(value).trim();
            if (!text) return;
            if (text.startsWith("[") && text.endsWith("]")) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) { parsed.forEach(pushValue); return; }
                } catch { /* ignore */ }
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
            return `<div class="mt-2"><a href="${attachmentUrl}" target="_blank" rel="noopener"><img src="${attachmentUrl}" alt="Adjunto" class="img-fluid rounded border" style="max-height:260px;object-fit:contain;"></a></div>`;
        }
        if (isPdf) {
            return `<div class="mt-2"><a href="${attachmentUrl}" target="_blank" rel="noopener">Ver PDF adjunto</a></div>`;
        }
        return `<div class="mt-2"><a href="${attachmentUrl}" target="_blank" rel="noopener">Ver adjunto</a></div>`;
    }

    function getAttachmentsMarkup(rawAttachments, fallbackAttachment = null) {
        const attachments = normalizeAttachmentList(rawAttachments, fallbackAttachment);
        if (!attachments.length) return "";
        return attachments.map((p) => getAttachmentMarkup(p)).join("");
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
        const oldValue = item?.old_value == null || item?.old_value === "" ? "sin valor" : String(item.old_value);
        const newValue = item?.new_value == null || item?.new_value === "" ? "sin valor" : String(item.new_value);
        if (field === "response") return "Se agrego una respuesta";
        return item?.description || `Cambio de ${label}: ${oldValue} -> ${newValue}`;
    }

    // Renderiza la conversación de respuestas de la orden.
    function renderResponses(items) {
        if (!Array.isArray(items) || !items.length) {
            responsesList.innerHTML = `<div class="text-muted">No hay respuestas todavía.</div>`;
            return;
        }
        responsesList.innerHTML = items.map((item) => {
            const roleDept = `${item.role || "Sin rol"} / ${item.department || "Sin departamento"}`;
            const attachments = getAttachmentsMarkup(item.attachments, item.attachment);
            return `
                <div class="service-order-response-item">
                    <div class="service-order-response-head">
                        <strong>${escapeHTML(item.name || item.username || "Usuario")}</strong>
                        <span class="service-order-response-meta">${escapeHTML(formatDateTime(item.created_at))}</span>
                    </div>
                    <div class="service-order-response-meta mb-2">${escapeHTML(roleDept)}</div>
                    <div>${escapeHTML(item.message || "")}</div>
                    ${attachments}
                </div>
            `;
        }).join("");
    }

    // Renderiza historial de cambios de la orden.
    function renderHistory(items) {
        if (!Array.isArray(items) || !items.length) {
            historyList.innerHTML = `<div class="text-muted">Sin cambios registrados.</div>`;
            return;
        }
        historyList.innerHTML = items.map((item) => {
            const roleDept = `${item.role || "Sin rol"} / ${item.department || "Sin departamento"}`;
            return `
                <div class="service-order-history-item">
                    <div class="service-order-history-head">
                        <strong>${escapeHTML(item.name || item.username || "Sistema")}</strong>
                        <span class="service-order-history-meta">${escapeHTML(formatDateTime(item.created_at))}</span>
                    </div>
                    <div class="service-order-history-meta mb-2">${escapeHTML(roleDept)}</div>
                    <div class="small text-muted">${escapeHTML(capitalize(historyFieldLabel(item.field_changed)))}</div>
                    <div>${escapeHTML(historyDescription(item))}</div>
                </div>
            `;
        }).join("");
    }

    function getLoggedUserId() {
        try {
            const user = JSON.parse(sessionStorage.getItem("loggedUserData") || "{}");
            return Number(user.id || 1);
        } catch {
            return 1;
        }
    }

    // Carga toda la información de una orden específica.
    async function openDetail(id) {
        const response = await apiFetch(`/api/service-orders/${id}`);
        const payload = await response.json();

        if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message || "No se pudo cargar el detalle");
        }

        const order = payload.data;
        orderIdInput.value = String(order.id_service_order);
        responseMessage.value = "";
        if (responseAttachment) responseAttachment.value = "";

        if (titleEl) titleEl.textContent = `Detalle ${order.order_number || ""}`.trim();

        const createdByRoleDept = `${order.created_by_role || "Sin rol"}/${order.created_by_department || "Sin departamento"}`;
        metaEl.innerHTML = `
            <div class="service-order-meta-card">
                <div class="service-order-meta-grid">
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Cliente</span>
                        <span class="service-order-meta-value">${escapeHTML(order.cliente || order.prospecto || "-")}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Ticket</span>
                        <span class="service-order-meta-value">${escapeHTML(order.ticket_number || "-")}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Tipo de servicio</span>
                        <span class="service-order-meta-value">${escapeHTML(order.service_type || "-")}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Asignado a</span>
                        <span class="service-order-meta-value">${escapeHTML(order.assigned_user || "-")}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Prioridad</span>
                        <span class="service-order-meta-value">${getPriorityBadgeMarkup(order.priority)}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Estatus</span>
                        <span class="service-order-meta-value">${getStatusBadgeMarkup(order.status)}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Inicio</span>
                        <span class="service-order-meta-value">${escapeHTML(formatDate(order.start_date))}</span>
                    </div>
                    <div class="service-order-meta-item">
                        <span class="service-order-meta-label">Entrega estimada</span>
                        <span class="service-order-meta-value">${escapeHTML(formatDate(order.estimated_delivery))}</span>
                    </div>
                    <div class="service-order-meta-item service-order-meta-item-wide">
                        <span class="service-order-meta-label">Creador</span>
                        <span class="service-order-meta-value">${escapeHTML(order.created_by || "-")} <span class="text-muted">(${escapeHTML(createdByRoleDept)})</span></span>
                    </div>
                </div>
                <div class="service-order-description-block">
                    <span class="service-order-meta-label">Descripción</span>
                    <p class="service-order-description-value mb-0">${escapeHTML(order.description || "-")}</p>
                </div>
            </div>
        `;

        if (openTicketBtn) {
            if (Number(order.id_ticket || 0) > 0) {
                openTicketBtn.dataset.id = String(order.id_ticket);
                openTicketBtn.classList.remove("d-none");
            } else {
                openTicketBtn.dataset.id = "";
                openTicketBtn.classList.add("d-none");
            }
        }

        renderResponses(order.responses || []);
        renderHistory(order.history || []);
    }

    // Envía una nueva respuesta al chat de la orden.
    async function saveResponse(event) {
        event.preventDefault();

        const id = Number(orderIdInput.value);
        const message = responseMessage.value.trim();

        if (!id || (!message && !responseAttachment?.files?.length)) {
            await showAlert("Debes escribir un mensaje o seleccionar al menos un adjunto");
            return;
        }

        const formData = new FormData();
        formData.append("message", message);
        formData.append("id_user", String(getLoggedUserId()));

        for (const file of Array.from(responseAttachment?.files || [])) {
            formData.append("attachments", file);
        }

        const response = await apiFetch(`/api/service-orders/${id}/responses`, {
            method: "POST",
            body: formData
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudo enviar la respuesta");
        }

        await openDetail(id);
    }

    openTicketBtn?.addEventListener("click", () => {
        const ticketId = Number(openTicketBtn.dataset.id || 0);
        if (!ticketId) return;
        sessionStorage.setItem("pendingTicketConversationId", String(ticketId));
        if (typeof loadView === "function") {
            loadView("views/ticketsSupport.html", "css/ticketsSupport.css", "js/ticketsSupport.js");
        }
    });

    responseForm?.addEventListener("submit", async (event) => {
        try {
            await saveResponse(event);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    // Initialize: load order from sessionStorage
    const soId = window.currentServiceOrderDetailId || null;
    if (soId) {
        openDetail(soId).catch(async (error) => {
            await showAlert(error.message);
            goBack();
        });
    } else {
        goBack();
    }
})();
