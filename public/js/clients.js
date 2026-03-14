(() => {
    const table = document.getElementById("clientsTable");
    const searchInput = document.getElementById("clientsSearch");
    const openAddClientBtn = document.getElementById("openAddClient");

    const detailBody = document.getElementById("clientDetailBody");
    const detailModal = bootstrap.Modal.getOrCreateInstance(document.getElementById("clientDetailModal"));

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    let clientsCache = [];
    const pageSize = 9;
    let currentPage = 1;
    const paginationContainer = ensurePaginationContainer(table, "clientsPagination");

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

    function renderTable(rows) {
        if (!rows.length) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted py-4">No hay clientes registrados</td>
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

        table.innerHTML = paginatedRows.map((item) => {
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

        renderPagination(rows.length, rows);
    }

    function applySearch() {
        currentPage = 1;
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
        currentPage = 1;
        applySearch();
    }

    function navigateToEditClient(clientId) {
        window.currentClientId = clientId ? Number(clientId) : null;
        if (typeof loadView === "function") {
            loadView("../views/addEditClient.html", "../css/addEditClient.css", "../js/addEditClient.js");
        }
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

        const contacts = Array.isArray(item.contacts) ? item.contacts : [];
        const contactsMarkup = contacts.length
            ? contacts.map((contact) => `
                <div class="border rounded-3 p-2 mb-2">
                    <div><small class="text-muted">Nombre</small><div>${escapeHTML(contact.name || "-")}</div></div>
                    <div><small class="text-muted">Puesto</small><div>${escapeHTML(contact.position || "-")}</div></div>
                    <div><small class="text-muted">Teléfono</small><div>${escapeHTML(contact.phone || "-")}</div></div>
                    <div><small class="text-muted">Correo</small><div>${escapeHTML(contact.email || "-")}</div></div>
                </div>
            `).join("")
            : "<div class=\"text-muted\">Sin contactos registrados</div>";

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
                <h6 class="fw-semibold mb-3">Cliente</h6>
                <div class="row g-3 mb-3">
                    <div class="col-md-6"><small class="text-muted d-block">Nombre</small><div>${escapeHTML(item.name || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Empresa</small><div>${escapeHTML(item.company || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Correo</small><div>${escapeHTML(item.email || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Telefono</small><div>${escapeHTML(item.phone || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Prioridad</small><div>${escapeHTML(item.priority || "-")}</div></div>
                    <div class="col-md-6"><small class="text-muted d-block">Estatus</small><div>${escapeHTML(item.status || "-")}</div></div>
                </div>
                <h6 class="fw-semibold mb-2">Contactos</h6>
                ${contactsMarkup}
            </div>
        `;

        detailModal.show();
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

    if (table) {
        searchInput?.addEventListener("input", applySearch);

        openAddClientBtn?.addEventListener("click", () => {
            navigateToEditClient("");
        });

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
                    navigateToEditClient(editBtn.dataset.id);
                    return;
                }

                if (deleteBtn) {
                    await deleteClient(deleteBtn.dataset.id);
                }
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
