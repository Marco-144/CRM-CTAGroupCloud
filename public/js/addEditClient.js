(() => {
    const form = document.getElementById("addEditClientForm");
    const clientIdInput = document.getElementById("aeClientId");
    const titleEl = document.getElementById("addEditClientTitle");

    const clientName = document.getElementById("aeClientName");
    const clientCompany = document.getElementById("aeClientCompany");
    const clientPhone = document.getElementById("aeClientPhone");
    const clientEmail = document.getElementById("aeClientEmail");
    const clientPriority = document.getElementById("aeClientPriority");
    const clientStatus = document.getElementById("aeClientStatus");

    const clientRfc = document.getElementById("aeClientRfc");
    const clientFiscalName = document.getElementById("aeClientFiscalName");
    const clientFiscalRegime = document.getElementById("aeClientFiscalRegime");
    const clientBillingEmail = document.getElementById("aeClientBillingEmail");
    const clientAddress = document.getElementById("aeClientAddress");
    const clientCity = document.getElementById("aeClientCity");
    const clientState = document.getElementById("aeClientState");
    const clientPostalCode = document.getElementById("aeClientPostalCode");
    const clientCountry = document.getElementById("aeClientCountry");
    const clientFiscalDoc = document.getElementById("aeClientFiscalDoc");
    const currentFiscalDocLink = document.getElementById("aeCurrentFiscalDocLink");

    const clientContactsList = document.getElementById("aeClientContactsList");
    const addContactRowBtn = document.getElementById("aeAddContactRow");

    const backBtn = document.getElementById("backToClients");
    const altBackBtn = document.getElementById("aeBackBtn");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));

    function goBack() {
        window.currentClientId = null;
        if (typeof loadView === "function") {
            loadView("views/clients.html", "css/clients.css", "js/clients.js");
        }
    }

    backBtn?.addEventListener("click", goBack);
    altBackBtn?.addEventListener("click", goBack);

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function createContactRow(contact = {}) {
        const row = document.createElement("div");
        row.className = "border rounded-3 p-2 client-contact-item";

        row.innerHTML = `
            <div class="row g-2 align-items-end mx-0">
                <div class="col-lg-3">
                    <label class="form-label">Nombre</label>
                    <input type="text" class="form-control client-contact-name" value="${escapeHTML(contact.name || "")}">
                </div>
                <div class="col-lg-3">
                    <label class="form-label">Puesto</label>
                    <input type="text" class="form-control client-contact-position" value="${escapeHTML(contact.position || "")}">
                </div>
                <div class="col-lg-2">
                    <label class="form-label">Teléfono</label>
                    <input type="text" class="form-control client-contact-phone" value="${escapeHTML(contact.phone || "")}">
                </div>
                <div class="col-lg-3">
                    <label class="form-label">Correo</label>
                    <input type="email" class="form-control client-contact-email" value="${escapeHTML(contact.email || "")}">
                </div>
                <div class="col-lg-1 d-grid">
                    <button type="button" class="btn btn-outline-danger remove-client-contact"><i class="bi bi-trash"></i></button>
                </div>
                <div class="col-lg-12">
                    <div class="form-check">
                        <input class="form-check-input client-contact-primary" type="checkbox" ${contact.is_primary ? "checked" : ""}>
                        <label class="form-check-label">Contacto principal</label>
                    </div>
                </div>
            </div>
        `;

        row.querySelector(".remove-client-contact")?.addEventListener("click", () => {
            row.remove();
            if (!clientContactsList?.children.length) {
                clientContactsList?.appendChild(createContactRow());
            }
        });

        row.querySelector(".client-contact-primary")?.addEventListener("change", (event) => {
            if (!event.target.checked) return;
            clientContactsList?.querySelectorAll(".client-contact-primary").forEach((checkbox) => {
                if (checkbox !== event.target) checkbox.checked = false;
            });
        });

        return row;
    }

    function renderContacts(contacts = []) {
        if (!clientContactsList) return;
        clientContactsList.innerHTML = "";

        if (!Array.isArray(contacts) || !contacts.length) {
            clientContactsList.appendChild(createContactRow());
            return;
        }

        contacts.forEach((contact) => {
            clientContactsList.appendChild(createContactRow(contact));
        });
    }

    function getContactsFromForm() {
        const rows = Array.from(clientContactsList?.querySelectorAll(".client-contact-item") || []);

        const contacts = rows.map((row) => ({
            name: row.querySelector(".client-contact-name")?.value?.trim() || "",
            position: row.querySelector(".client-contact-position")?.value?.trim() || "",
            phone: row.querySelector(".client-contact-phone")?.value?.trim() || "",
            email: row.querySelector(".client-contact-email")?.value?.trim() || "",
            is_primary: row.querySelector(".client-contact-primary")?.checked ? 1 : 0,
        })).filter((item) => item.name || item.position || item.phone || item.email);

        if (!contacts.some((item) => item.is_primary) && contacts.length > 0) {
            contacts[0].is_primary = 1;
        }

        return contacts;
    }

    async function loadClientData(clientId) {
        const response = await apiFetch(`/api/clients/${clientId}`);
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message || "No se pudo cargar el perfil del cliente");
        }

        const item = payload.data;

        clientIdInput.value = item.id_prospect || item.id_client || clientId;
        clientName.value = item.name || "";
        clientCompany.value = item.company || "";
        clientPhone.value = item.phone || "";
        clientEmail.value = item.email || "";
        clientPriority.value = item.priority || "Media";
        clientStatus.value = item.status || "Activo";

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

        renderContacts(item.contacts || []);

        if (titleEl) titleEl.textContent = "Editar Cliente";
    }

    function initBlankForm() {
        form?.reset();
        clientIdInput.value = "";
        clientPriority.value = "Media";
        clientStatus.value = "Activo";
        clientCountry.value = "Mexico";
        clientFiscalDoc.value = "";
        currentFiscalDocLink.href = "#";
        currentFiscalDocLink.classList.add("d-none");
        renderContacts([]);
        if (titleEl) titleEl.textContent = "Agregar Cliente";
    }

    async function saveClient(event) {
        event.preventDefault();

        const id = clientIdInput.value;
        const body = new FormData();

        body.append("name", clientName.value.trim());
        body.append("company", clientCompany.value.trim());
        body.append("phone", clientPhone.value.trim());
        body.append("email", clientEmail.value.trim());
        body.append("priority", clientPriority.value);
        body.append("status", clientStatus.value);

        body.append("rfc", clientRfc.value.trim());
        body.append("fiscal_name", clientFiscalName.value.trim());
        body.append("fiscal_regime", clientFiscalRegime.value.trim());
        body.append("billing_email", clientBillingEmail.value.trim());
        body.append("address", clientAddress.value.trim());
        body.append("city", clientCity.value.trim());
        body.append("state", clientState.value.trim());
        body.append("postal_code", clientPostalCode.value.trim());
        body.append("country", clientCountry.value.trim() || "Mexico");
        body.append("contacts", JSON.stringify(getContactsFromForm()));

        if (clientFiscalDoc.files[0]) {
            body.append("tax_certificate_pdf", clientFiscalDoc.files[0]);
        }

        const endpoint = id ? `/api/clients/${id}` : "/api/clients";
        const method = id ? "PUT" : "POST";

        const response = await apiFetch(endpoint, { method, body });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || "No se pudo guardar el cliente");
        }

        goBack();
    }

    addContactRowBtn?.addEventListener("click", () => {
        clientContactsList?.appendChild(createContactRow());
    });

    form?.addEventListener("submit", async (event) => {
        try {
            await saveClient(event);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    // Initialize: load existing client or blank form
    const editId = window.currentClientId || null;
    if (editId) {
        loadClientData(editId).catch(async (error) => {
            await showAlert(error.message);
            goBack();
        });
    } else {
        initBlankForm();
    }
})();
