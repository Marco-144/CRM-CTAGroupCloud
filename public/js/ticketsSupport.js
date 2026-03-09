(() => {
	const table = document.getElementById("ticketsTable");
	const openAddBtn = document.getElementById("openAddTicket");
	const searchInput = document.getElementById("ticketsSearch");
	const statusFilter = document.getElementById("ticketsStatusFilter");
	const priorityFilter = document.getElementById("ticketsPriorityFilter");
	const typeFilter = document.getElementById("ticketsTypeFilter");

	const form = document.getElementById("ticketForm");
	const modalTitle = document.getElementById("ticketModalTitle");

	const ticketId = document.getElementById("ticketId");
	const ticketServiceOrder = document.getElementById("ticketServiceOrder");
	const ticketProspect = document.getElementById("ticketProspect");
	const ticketSubject = document.getElementById("ticketSubject");
	const ticketDescription = document.getElementById("ticketDescription");
	const ticketDepartment = document.getElementById("ticketDepartment");
	const ticketAssignedUser = document.getElementById("ticketAssignedUser");
	const ticketPriority = document.getElementById("ticketPriority");
	const ticketStatus = document.getElementById("ticketStatus");
	const ticketType = document.getElementById("ticketType");
	const ticketDueDate = document.getElementById("ticketDueDate");

	const ticketModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("ticketModal"));

	const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
	const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

	let ticketsCache = [];
	let serviceOrdersCache = [];
	let prospectsCache = [];
	let departmentsCache = [];
	let usersCache = [];

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
				<td colspan="7" class="text-center text-muted py-4">No se encontraron tickets</td>
			</tr>
		`;
			return;
		}

		table.innerHTML = data.map((ticket) => `
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
			<td>${formatDate(ticket.created_at)}</td>
			<td>${escapeHTML(ticket.assigned_user || "-")}</td>
		</tr>
	`).join("");
	}

	async function loadCatalogs() {
		const [ordersRes, prospectsRes, departmentsRes, usersRes] = await Promise.all([
			apiFetch("/api/service-orders"),
			apiFetch("/api/prospects?status=Activo"),
			apiFetch("/api/departments"),
			apiFetch("/api/users")
		]);

		const [ordersPayload, prospectsPayload, departmentsPayload, usersPayload] = await Promise.all([
			ordersRes.json(),
			prospectsRes.json(),
			departmentsRes.json(),
			usersRes.json()
		]);

		if (!ordersRes.ok || !ordersPayload.success) throw new Error(ordersPayload.message || "No se pudieron cargar órdenes");
		if (!prospectsRes.ok || !prospectsPayload.success) throw new Error(prospectsPayload.message || "No se pudieron cargar prospectos");
		if (!departmentsRes.ok || !departmentsPayload.success) throw new Error(departmentsPayload.message || "No se pudieron cargar departamentos");
		if (!usersRes.ok || !usersPayload.success) throw new Error(usersPayload.message || "No se pudieron cargar usuarios");

		serviceOrdersCache = ordersPayload.data || [];
		prospectsCache = prospectsPayload.data || [];
		departmentsCache = departmentsPayload.data || [];
		usersCache = usersPayload.data || [];

		ticketServiceOrder.innerHTML = `
		<option value="">Seleccionar orden</option>
		${serviceOrdersCache.map((order) => `
			<option value="${order.id_service_order}">${escapeHTML(order.order_number)} - ${escapeHTML(order.prospecto || "")}</option>
		`).join("")}
	`;

		ticketProspect.innerHTML = `
		<option value="">Seleccionar prospecto</option>
		${prospectsCache.map((prospect) => `
			<option value="${prospect.id_prospect}">${escapeHTML(prospect.company)}</option>
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
			<option value="${user.id}">${escapeHTML(user.username)}</option>
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
		renderTable(ticketsCache);
	}

	function resetForm() {
		form.reset();
		ticketId.value = "";
		ticketPriority.value = "medio";
		ticketStatus.value = "abierto";
		ticketType.value = "soporte";
		modalTitle.textContent = "Nuevo Ticket";
	}

	function fillForm(ticket) {
		ticketId.value = ticket.id_ticket;
		ticketServiceOrder.value = String(ticket.id_service_order || "");
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
			id_service_order: Number(ticketServiceOrder.value),
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

		if (!payload.id_service_order || !payload.id_prospect || !payload.subject || !payload.id_department) {
			await showAlert("Orden, prospecto, asunto y departamento son obligatorios");
			return;
		}

		const endpoint = id ? `/api/tickets/${id}` : "/api/tickets";
		const method = id ? "PUT" : "POST";

		const response = await apiFetch(endpoint, {
			method,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});

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

			try {
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

		Promise.all([loadCatalogs(), loadTickets()]).catch((error) => {
			table.innerHTML = `
			<tr>
				<td colspan="7" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
			</tr>
		`;
		});
	}
})();
