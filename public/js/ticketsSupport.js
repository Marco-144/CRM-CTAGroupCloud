(() => {
	const table = document.getElementById("ticketsTable");
	const openAddBtn = document.getElementById("openAddTicket");
	const searchInput = document.getElementById("ticketsSearch");
	const statusFilter = document.getElementById("ticketsStatusFilter");
	const priorityFilter = document.getElementById("ticketsPriorityFilter");
	const typeFilter = document.getElementById("ticketsTypeFilter");

	const form = document.getElementById("ticketForm");
	const modalTitle = document.getElementById("ticketModalTitle");
	const conversationTitle = document.getElementById("ticketConversationTitle");
	const conversationMeta = document.getElementById("ticketConversationMeta");
	const responsesList = document.getElementById("ticketResponsesList");
	const historyList = document.getElementById("ticketHistoryList");
	const responseForm = document.getElementById("ticketResponseForm");
	const conversationTicketId = document.getElementById("ticketConversationId");
	const responseMessage = document.getElementById("ticketResponseMessage");
	const ticketServiceOrdersList = document.getElementById("ticketServiceOrdersList");
	const responseAttachment = document.getElementById("ticketResponseAttachment");
	const createSOFromTicketBtn = document.getElementById("createSOFromTicketBtn");

	const ticketId = document.getElementById("ticketId");
	const ticketProspect = document.getElementById("ticketProspect");
	const ticketSubject = document.getElementById("ticketSubject");
	const ticketDescription = document.getElementById("ticketDescription");
	const ticketDepartment = document.getElementById("ticketDepartment");
	const ticketAssignedUser = document.getElementById("ticketAssignedUser");
	const ticketPriority = document.getElementById("ticketPriority");
	const ticketStatus = document.getElementById("ticketStatus");
	const ticketType = document.getElementById("ticketType");
	const ticketDueDate = document.getElementById("ticketDueDate");
	const ticketAttachment = document.getElementById("ticketAttachment");

	const ticketModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("ticketModal"));
	const conversationModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("ticketConversationModal"));

	const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
	const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

	let ticketsCache = [];
	let clientsCache = [];
	let departmentsCache = [];
	let usersCache = [];
	const pageSize = 9;
	let currentPage = 1;
	const paginationContainer = ensurePaginationContainer(table, "ticketsPagination");

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

	function consumePendingConversationId() {
		const raw = window.pendingTicketConversationId || sessionStorage.getItem("pendingTicketConversationId") || "";
		const safeId = Number(raw || 0);

		window.pendingTicketConversationId = null;
		sessionStorage.removeItem("pendingTicketConversationId");

		return safeId > 0 ? safeId : null;
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
			id_service_order: "orden de servicio",
			service_order: "orden de servicio",
			id_prospect: "cliente",
			subject: "asunto",
			description: "descripcion",
			id_department: "departamento",
			id_assigned_user: "usuario asignado",
			priority: "prioridad",
			status: "estatus",
			ticket_type: "tipo de ticket",
			due_date: "fecha limite",
			has_service_order: "vinculacion de orden",
			response: "respuesta",
		};

		return map[String(fieldName || "")] || "ticket";
	}

	function historyDescription(item) {
		const field = String(item?.field_changed || "");
		const label = historyFieldLabel(field);
		const oldValue = item?.old_value === null || item?.old_value === undefined || item?.old_value === "" ? "sin valor" : String(item.old_value);
		const newValue = item?.new_value === null || item?.new_value === undefined || item?.new_value === "" ? "sin valor" : String(item.new_value);

		if (field === "response") {
			return "Se agrego una respuesta";
		}

		if (field === "service_order") {
			return item?.description || "Se agrego una orden de servicio";
		}

		return `Cambio de ${label}: ${oldValue} -> ${newValue}`;
	}

	function getStatusBadge(status) {
		const map = {
			abierto: "bg-secondary",
			"en progreso": "bg-primary",
			"en espera": "bg-warning text-dark",
			resuelto: "bg-success"
		};

		return map[String(status || "").toLowerCase()] || "bg-secondary";
	}

	function getPriorityBadge(priority) {
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
				<td colspan="9" class="text-center text-muted py-4">No se encontraron tickets</td>
			</tr>
		`;
			renderPagination(0, data || []);
			return;
		}

		const totalPages = Math.max(1, Math.ceil(data.length / pageSize));
		if (currentPage > totalPages) {
			currentPage = totalPages;
		}

		const start = (currentPage - 1) * pageSize;
		const paginatedData = data.slice(start, start + pageSize);

		table.innerHTML = paginatedData.map((ticket) => `
		<tr>
			<td>
				<button class="btn btn-link p-0 text-decoration-none edit-ticket" data-id="${ticket.id_ticket}">
					${escapeHTML(ticket.ticket_number || "-")}
				</button>
			</td>
			<td>${escapeHTML(ticket.created_by || "-")}</td>
			<td>${escapeHTML(ticket.subject || "-")}</td>
			<td><span class="badge ${getPriorityBadge(ticket.priority)}">${escapeHTML(capitalize(ticket.priority))}</span></td>
			<td><span class="badge ${getStatusBadge(ticket.status)}">${escapeHTML(capitalize(ticket.status))}</span></td>
			<td class="text-center">${Number(ticket.total_service_orders || 0)}</td>
			<td>${formatDate(ticket.created_at)}</td>
			<td>${escapeHTML(ticket.assigned_user || "-")}</td>
			<td class="text-end">
				<button class="btn btn-sm btn-outline-primary conversation-ticket" data-id="${ticket.id_ticket}">
					<i class="bi bi-chat-left-text"></i>
				</button>
			</td>
		</tr>
	`).join("");

		renderPagination(data.length, data);
	}

	function renderResponses(items) {
		if (!Array.isArray(items) || !items.length) {
			responsesList.innerHTML = `<div class="text-muted">No hay respuestas todavía.</div>`;
			return;
		}

		responsesList.innerHTML = items.map((item) => {
			const roleDept = `${item.role || "Sin rol"} / ${item.department || "Sin departamento"}`;
			const attachment = getAttachmentsMarkup(item.attachments, item.attachment);
			return `
				<div class="ticket-response-item">
					<div class="ticket-response-head">
						<strong>${escapeHTML(item.name || item.username || "Usuario")}</strong>
						<span class="ticket-response-meta">${escapeHTML(formatDateTime(item.created_at))}</span>
					</div>
					<div class="ticket-response-meta mb-2">${escapeHTML(roleDept)}</div>
					<div>${escapeHTML(item.message || "")}</div>
					${attachment}
				</div>
			`;
		}).join("");
	}

	function renderHistory(items) {
		if (!Array.isArray(items) || !items.length) {
			historyList.innerHTML = `<div class="text-muted">Sin cambios registrados.</div>`;
			return;
		}

		historyList.innerHTML = items.map((item) => {
			const roleDept = `${item.role || "Sin rol"} / ${item.department || "Sin departamento"}`;
			return `
				<div class="ticket-history-item">
					<div class="ticket-history-head">
						<strong>${escapeHTML(item.name || item.username || "Sistema")}</strong>
						<span class="ticket-history-meta">${escapeHTML(formatDateTime(item.created_at))}</span>
					</div>
					<div class="ticket-history-meta mb-2">${escapeHTML(roleDept)}</div>
					<div class="small text-muted">${escapeHTML(capitalize(historyFieldLabel(item.field_changed)))}</div>
					<div>${escapeHTML(historyDescription(item))}</div>
				</div>
			`;
		}).join("");
	}

	async function openConversation(ticketIdValue) {
		const ticketIdNumber = Number(ticketIdValue);
		if (!ticketIdNumber) return;

		const response = await apiFetch(`/api/tickets/${ticketIdNumber}`);
		const payload = await response.json().catch(() => ({}));

		if (!response.ok || !payload.success || !payload.data) {
			throw new Error(payload.message || "No se pudo cargar la conversacion del ticket");
		}

		const ticket = payload.data;
		conversationTicketId.value = String(ticket.id_ticket);
		responseMessage.value = "";
		if (responseAttachment) responseAttachment.value = "";

		conversationTitle.textContent = `Conversacion ${ticket.ticket_number || ""}`.trim();
		conversationMeta.innerHTML = `
			<div class="small text-muted">
				<strong>Asunto:</strong> ${escapeHTML(ticket.subject || "-")}<br>
				<strong>Cliente:</strong> ${escapeHTML(ticket.cliente || ticket.prospecto || "-")}<br>
				<strong>Creador:</strong> ${escapeHTML(ticket.created_by || "-")} (${escapeHTML(ticket.created_by_role || "Sin rol")}/${escapeHTML(ticket.created_by_department || "Sin departamento")})
			</div>
		`;

		const serviceOrders = Array.isArray(ticket.service_orders) ? ticket.service_orders : [];
		if (ticketServiceOrdersList) {
			if (!serviceOrders.length) {
				ticketServiceOrdersList.innerHTML = `<span class="text-muted">Sin ordenes registradas para este ticket.</span>`;
			} else {
				ticketServiceOrdersList.innerHTML = serviceOrders.map((order) => {
					return `<div class="mb-1"><strong>${escapeHTML(order.order_number || "-")}</strong> - ${escapeHTML(order.service_type || "-")} (${escapeHTML(capitalize(order.status || "pendiente"))})</div>`;
				}).join("");
			}
		}

		if (createSOFromTicketBtn) {
			createSOFromTicketBtn.dataset.id = String(ticket.id_ticket);
			createSOFromTicketBtn.classList.remove("d-none");
		}

		renderResponses(ticket.responses || []);
		renderHistory(ticket.history || []);
		conversationModal.show();
	}

	async function saveResponse(event) {
		event.preventDefault();

		const id = Number(conversationTicketId.value);
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

		const response = await apiFetch(`/api/tickets/${id}/responses`, {
			method: "POST",
			body: formData
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok || !payload.success) {
			throw new Error(payload.message || "No se pudo enviar la respuesta");
		}

		await openConversation(id);
		await loadTickets();
	}

	async function createServiceOrderFromTicket(ticketIdValue) {
		const ticketIdNumber = Number(ticketIdValue);
		if (!ticketIdNumber) return;

		const confirmed = await showConfirm("¿Crear una orden de servicio con base en este ticket?");
		if (!confirmed) return;

		const response = await apiFetch(`/api/service-orders/from-ticket/${ticketIdNumber}`, {
			method: "POST",
			body: JSON.stringify({})
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok || !payload.success) {
			throw new Error(payload.message || "No se pudo crear la orden desde el ticket");
		}

		await showAlert(`Orden creada: ${payload.order_number || payload.id_service_order}`);
		await openConversation(ticketIdNumber);
		await loadTickets();
	}

	async function loadCatalogs() {
		const [clientsRes, departmentsRes, usersRes] = await Promise.all([
			apiFetch("/api/clients"),
			apiFetch("/api/departments"),
			apiFetch("/api/users")
		]);

		const [clientsPayload, departmentsPayload, usersPayload] = await Promise.all([
			clientsRes.json(),
			departmentsRes.json(),
			usersRes.json()
		]);

		if (!clientsRes.ok || !clientsPayload.success) throw new Error(clientsPayload.message || "No se pudieron cargar clientes");
		if (!departmentsRes.ok || !departmentsPayload.success) throw new Error(departmentsPayload.message || "No se pudieron cargar departamentos");
		if (!usersRes.ok || !usersPayload.success) throw new Error(usersPayload.message || "No se pudieron cargar usuarios");

		clientsCache = clientsPayload.data || [];
		departmentsCache = departmentsPayload.data || [];
		usersCache = usersPayload.data || [];

		ticketProspect.innerHTML = `
		<option value="">Seleccionar cliente</option>
		${clientsCache.map((client) => `
			<option value="${client.id_client}">${escapeHTML(client.company)}</option>
		`).join("")}
	`;

		ticketDepartment.innerHTML = `
		<option value="">Seleccionar departamento</option>
		${departmentsCache.map((department) => `
			<option value="${department.id_department}">${escapeHTML(department.name)}</option>
		`).join("")}
	`;

		ticketAssignedUser.innerHTML = `
		<option value="">Sin asignar</option>
		${usersCache.map((user) => `
			<option value="${user.id}">${escapeHTML(user.name || user.username || "Usuario")}</option>
		`).join("")}
	`;
	}

	async function loadTickets() {
		const params = new URLSearchParams();

		const search = searchInput.value.trim();
		const status = statusFilter.value;
		const priority = priorityFilter.value;
		const type = typeFilter.value;

		if (search) params.append("search", search);
		if (status) params.append("status", status);
		if (priority) params.append("priority", priority);
		if (type) params.append("ticket_type", type);

		const response = await apiFetch(`/api/tickets?${params.toString()}`);
		const payload = await response.json();

		if (!response.ok || !payload.success) {
			throw new Error(payload.message || "No se pudieron cargar tickets");
		}

		ticketsCache = payload.data || [];
		currentPage = 1;
		renderTable(ticketsCache);
	}

	function resetForm() {
		form.reset();
		ticketId.value = "";
		ticketPriority.value = "medio";
		ticketStatus.value = "abierto";
		ticketType.value = "soporte";
		if (ticketAttachment) ticketAttachment.value = "";
		modalTitle.textContent = "Nuevo Ticket";
	}

	function fillForm(ticket) {
		ticketId.value = ticket.id_ticket;
		ticketProspect.value = String(ticket.id_prospect || "");
		ticketSubject.value = ticket.subject || "";
		ticketDescription.value = ticket.description || "";
		ticketDepartment.value = String(ticket.id_department || "");
		ticketAssignedUser.value = ticket.id_assigned_user ? String(ticket.id_assigned_user) : "";
		ticketPriority.value = String(ticket.priority || "medio").toLowerCase();
		ticketStatus.value = String(ticket.status || "abierto").toLowerCase();
		ticketType.value = String(ticket.ticket_type || "soporte").toLowerCase();
		ticketDueDate.value = ticket.due_date ? String(ticket.due_date).split("T")[0] : "";
		modalTitle.textContent = "Editar Ticket";
	}

	async function saveTicket(event) {
		event.preventDefault();

		const id = ticketId.value;

		const payload = {
			id_prospect: Number(ticketProspect.value),
			subject: ticketSubject.value.trim(),
			description: ticketDescription.value.trim() || null,
			id_department: Number(ticketDepartment.value),
			id_created_by: getLoggedUserId(),
			id_assigned_user: ticketAssignedUser.value ? Number(ticketAssignedUser.value) : null,
			priority: ticketPriority.value,
			status: ticketStatus.value,
			ticket_type: ticketType.value,
			due_date: ticketDueDate.value || null,
			id_user: getLoggedUserId()
		};

		if (!payload.id_prospect || !payload.subject || !payload.id_department) {
			await showAlert("Cliente, asunto y departamento son obligatorios");
			return;
		}

		const endpoint = id ? `/api/tickets/${id}` : "/api/tickets";
		const method = id ? "PUT" : "POST";

		let response;
		if (method === "POST") {
			const formData = new FormData();

			Object.entries(payload).forEach(([key, value]) => {
				if (value === null || value === undefined || value === "") return;
				formData.append(key, String(value));
			});

			for (const file of Array.from(ticketAttachment?.files || [])) {
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
			throw new Error(result.message || "No se pudo guardar el ticket");
		}

		ticketModal.hide();
		await loadTickets();
	}

	async function deleteTicket(id) {
		const confirmed = await showConfirm("¿Eliminar este ticket?");
		if (!confirmed) return;

		const response = await apiFetch(`/api/tickets/${id}`, { method: "DELETE" });
		const result = await response.json().catch(() => ({}));

		if (!response.ok || !result.success) {
			throw new Error(result.message || "No se pudo eliminar el ticket");
		}

		await loadTickets();
	}

	if (table && form) {
		openAddBtn?.addEventListener("click", async () => {
			try {
				resetForm();
				await loadCatalogs();
				ticketModal.show();
			} catch (error) {
				await showAlert(error.message);
			}
		});

		form.addEventListener("submit", async (event) => {
			try {
				await saveTicket(event);
			} catch (error) {
				await showAlert(error.message);
			}
		});

		searchInput.addEventListener("input", () => {
			loadTickets().catch((error) => showAlert(error.message));
		});

		statusFilter.addEventListener("change", () => {
			loadTickets().catch((error) => showAlert(error.message));
		});

		priorityFilter.addEventListener("change", () => {
			loadTickets().catch((error) => showAlert(error.message));
		});

		typeFilter.addEventListener("change", () => {
			loadTickets().catch((error) => showAlert(error.message));
		});

		table.addEventListener("click", async (event) => {
			const editBtn = event.target.closest(".edit-ticket");
			const conversationBtn = event.target.closest(".conversation-ticket");

			try {
				if (conversationBtn) {
					await openConversation(conversationBtn.dataset.id);
					return;
				}

				if (editBtn) {
					const ticket = ticketsCache.find((item) => Number(item.id_ticket) === Number(editBtn.dataset.id));
					if (!ticket) return;

					await loadCatalogs();
					fillForm(ticket);
					ticketModal.show();
					return;
				}
			} catch (error) {
				await showAlert(error.message);
			}
		});

		responseForm?.addEventListener("submit", async (event) => {
			try {
				await saveResponse(event);
			} catch (error) {
				await showAlert(error.message);
			}
		});

		createSOFromTicketBtn?.addEventListener("click", async (event) => {
			try {
				await createServiceOrderFromTicket(event.currentTarget.dataset.id);
			} catch (error) {
				await showAlert(error.message);
			}
		});

		Promise.all([loadCatalogs(), loadTickets()]).then(async () => {
			const pendingId = consumePendingConversationId();
			if (!pendingId) return;

			try {
				await openConversation(pendingId);
			} catch (error) {
				await showAlert(error.message || "No se pudo abrir el ticket solicitado");
			}
		}).catch((error) => {
			table.innerHTML = `
			<tr>
				<td colspan="9" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
			</tr>
		`;
		});
	}
})();
