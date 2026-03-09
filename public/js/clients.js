(() => {
    const table = document.getElementById("clientsTable");
    const searchInput = document.getElementById("clientsSearch");

    const form = document.getElementById("clientProfileForm");
    const profileModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("clientProfileModal"));
    const detailBody = document.getElementById("clientDetailBody");
    const detailModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("clientDetailModal"));

    const clientProspectId = document.getElementById("clientProspectId");
    const clientRfc = document.getElementById("clientRfc");
    const clientFiscalName = document.getElementById("clientFiscalName");
    const clientFiscalRegime = document.getElementById("clientFiscalRegime");
    const clientBillingEmail = document.getElementById("clientBillingEmail");
    const clientAddress = document.getElementById("clientAddress");
    const clientCity = document.getElementById("clientCity");
    const clientState = document.getElementById("clientState");
    const clientPostalCode = document.getElementById("clientPostalCode");
    const clientCountry = document.getElementById("clientCountry");
    const clientFiscalDoc = document.getElementById("clientFiscalDoc");
    const currentFiscalDocLink = document.getElementById("currentFiscalDocLink");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let clientsCache = [];

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderTable(rows) {
        if (!rows.length) {
            table.innerHTML = `
			<tr>
				<td colspan="6" class="text-center text-muted py-4">No hay clientes registrados</td>
			</tr>
		`;
            return;
        }

        table.innerHTML = rows.map((item) => {
            const doc = item.tax_certificate_pdf
                ? `<a class="doc-link" href="/${item.tax_certificate_pdf}" target="_blank" rel="noopener">Ver PDF</a>`
                : "-";

            return `
			<tr>
				<td>${escapeHTML(item.company || "-")}</td>
				<td>${escapeHTML(item.name || "-")}</td>
				<td>${escapeHTML(item.rfc || "-")}</td>
				<td>${escapeHTML(item.billing_email || "-")}</td>
				<td>${doc}</td>
				<td class="text-end">
                    <button class="btn btn-sm btn-outline-secondary view-client" data-id="${item.id_client}">
                        <i class="bi bi-eye"></i>
                    </button>
					<button class="btn btn-sm btn-outline-primary edit-client" data-id="${item.id_client}">
						<i class="bi bi-pencil"></i>
					</button>
                    <button class="btn btn-sm btn-outline-danger ms-2 delete-client" data-id="${item.id_client}">
                        <i class="bi bi-trash"></i>
                    </button>
				</td>
			</tr>
		`;
        }).join("");
    }

    function applySearch() {
        const q = (searchInput.value || "").trim().toLowerCase();
        if (!q) {
            renderTable(clientsCache);
            return;
        }

        const filtered = clientsCache.filter((item) => {
            const company = String(item.company || "").toLowerCase();
            const name = String(item.name || "").toLowerCase();
            const rfc = String(item.rfc || "").toLowerCase();
            return company.includes(q) || name.includes(q) || rfc.includes(q);
        });

        renderTable(filtered);
    }

    async function loadClients() {
        const response = await apiFetch("/api/clients");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudieron cargar los clientes");
        }

        clientsCache = payload.data || [];
        applySearch();
    }

    async function openProfile(clientId) {
        const response = await apiFetch(`/api/clients/${clientId}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message || "No se pudo cargar el perfil del cliente");
        }

        const item = payload.data;

        clientProspectId.value = item.id_prospect;
        clientRfc.value = item.rfc || "";
        clientFiscalName.value = item.fiscal_name || "";
        clientFiscalRegime.value = item.fiscal_regime || "";
        clientBillingEmail.value = item.billing_email || "";
        clientAddress.value = item.address || "";
        clientCity.value = item.city || "";
        clientState.value = item.state || "";
        clientPostalCode.value = item.postal_code || "";
        clientCountry.value = item.country || "Mexico";
        clientFiscalDoc.value = "";

        if (item.tax_certificate_pdf) {
            currentFiscalDocLink.href = `/${item.tax_certificate_pdf}`;
            currentFiscalDocLink.classList.remove("d-none");
        } else {
            currentFiscalDocLink.href = "#";
            currentFiscalDocLink.classList.add("d-none");
        }

        profileModal.show();
    }

    async function openClientDetail(clientId) {
        const response = await apiFetch(`/api/clients/${clientId}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message || "No se pudo cargar el detalle del cliente");
        }

        const item = payload.data;
        const docLink = item.tax_certificate_pdf
            ? `<a class="doc-link" href="/${item.tax_certificate_pdf}" target="_blank" rel="noopener">Ver constancia</a>`
            : "Sin documento";

        detailBody.innerHTML = `
            <div class="client-detail-section mb-4">
                <h6 class="fw-semibold mb-3">Informacion fiscal</h6>
                <div class="row g-3">
                    <div class="col-md-4"><small class="text-muted d-block">RFC</small><div>${escapeHTML(item.rfc || "-")}</div></div>
                    <div class="col-md-8"><small class="text-muted d-block">Razon social</small><div>${escapeHTML(item.fiscal_name || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Regimen fiscal</small><div>${escapeHTML(item.fiscal_regime || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Email de facturacion</small><div>${escapeHTML(item.billing_email || "-")}</div></div>
                    <div class="col-md-12"><small class="text-muted d-block">Direccion fiscal</small><div>${escapeHTML(item.address || "-")}</div></div>
                    <div class="col-md-4"><small class="text-muted d-block">Ciudad</small><div>${escapeHTML(item.city || "-")}</div></div>
                    <div class="col-md-4"><small class="text-muted d-block">Estado</small><div>${escapeHTML(item.state || "-")}</div></div>
                    <div class="col-md-4"><small class="text-muted d-block">Codigo postal</small><div>${escapeHTML(item.postal_code || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Pais</small><div>${escapeHTML(item.country || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Constancia</small><div>${docLink}</div></div>
                </div>
            </div>

            <div class="client-detail-section border-top pt-3">
                <h6 class="fw-semibold mb-3">Contacto</h6>
                <div class="row g-3">
                    <div class="col-md-6"><small class="text-muted d-block">Nombre</small><div>${escapeHTML(item.name || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Empresa</small><div>${escapeHTML(item.company || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Correo</small><div>${escapeHTML(item.email || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Telefono</small><div>${escapeHTML(item.phone || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Prioridad</small><div>${escapeHTML(item.priority || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Estatus</small><div>${escapeHTML(item.status || "-")}</div></div>
                </div>
            </div>
        `;

        detailModal.show();
    }

    async function saveProfile(event) {
        event.preventDefault();

        const id = clientProspectId.value;
        if (!id) {
            await showAlert("Cliente invalido");
            return;
        }

        const body = new FormData();
        body.append("rfc", clientRfc.value.trim());
        body.append("fiscal_name", clientFiscalName.value.trim());
        body.append("fiscal_regime", clientFiscalRegime.value.trim());
        body.append("billing_email", clientBillingEmail.value.trim());
        body.append("address", clientAddress.value.trim());
        body.append("city", clientCity.value.trim());
        body.append("state", clientState.value.trim());
        body.append("postal_code", clientPostalCode.value.trim());
        body.append("country", clientCountry.value.trim() || "Mexico");

        if (clientFiscalDoc.files[0]) {
            body.append("tax_certificate_pdf", clientFiscalDoc.files[0]);
        }

        const response = await apiFetch(`/api/clients/${id}/profile`, {
            method: "PUT",
            body,
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudo guardar el perfil fiscal");
        }

        profileModal.hide();
        await loadClients();
    }

    async function deleteClient(clientId) {
        const confirmed = await showConfirm("¿Eliminar este cliente de la lista?");
        if (!confirmed) return;

        const response = await apiFetch(`/api/clients/${clientId}`, { method: "DELETE" });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudo eliminar el cliente");
        }

        await loadClients();
    }

    if (table && form) {
        searchInput.addEventListener("input", applySearch);

        table.addEventListener("click", async (event) => {
            const viewBtn = event.target.closest(".view-client");
            const editBtn = event.target.closest(".edit-client");
            const deleteBtn = event.target.closest(".delete-client");

            try {
                if (viewBtn) {
                    await openClientDetail(viewBtn.dataset.id);
                    return;
                }

                if (editBtn) {
                    await openProfile(editBtn.dataset.id);
                    return;
                }

                if (deleteBtn) {
                    await deleteClient(deleteBtn.dataset.id);
                }
            } catch (error) {
                await showAlert(error.message);
            }
        });

        form.addEventListener("submit", async (event) => {
            try {
                await saveProfile(event);
            } catch (error) {
                await showAlert(error.message);
            }
        });

        loadClients().catch((error) => {
            table.innerHTML = `
			<tr>
				<td colspan="6" class="text-center text-danger py-4">${escapeHTML(error.message)}</td>
			</tr>
		`;
        });
    }
})();
