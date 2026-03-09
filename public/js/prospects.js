(() => {
// Módulo de prospectos: listado, búsqueda, filtros, alta, edición y eliminación.
const prospectsTable = document.getElementById('prospectsTable');
const prospectForm = document.getElementById('prospectForm');
const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const totalProspects = document.getElementById('totalProspects');
const activeProspects = document.getElementById('activeProspects');
const openAddProspectBtn = document.getElementById('openAddProspect');
const saveProspectBtn = document.getElementById('saveProspectBtn');
const modalTitle = document.querySelector('#addProspectModal .modal-title');
const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

const prospectIdInput = document.getElementById('prospectId');
const prospectNameInput = document.getElementById('prospectName');
const prospectEmailInput = document.getElementById('prospectEmail');
const prospectPhoneInput = document.getElementById('prospectPhone');
const prospectCompanyInput = document.getElementById('prospectCompany');
const prospectPriorityInput = document.getElementById('prospectPriority');
const prospectStatusInput = document.getElementById('prospectStatus');

const addProspectModalElement = document.getElementById('addProspectModal');
const addProspectModal = addProspectModalElement
    ? bootstrap.Modal.getOrCreateInstance(addProspectModalElement)
    : null;

let prospectsCache = [];

// Obtiene el id del prospecto tolerando distintas llaves de respuesta.
function getProspectId(item) {
    return item?.id_prospect ?? item?.id_prospects ?? item?.id ?? null;
}

// Escapa texto dinámico para prevenir inyección HTML en el render.
function escapeHTML(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Devuelve el badge visual según prioridad del prospecto.
function getPriority(priority) {
    if (priority === 'Alta') {
        return `<span class="badge text-bg-danger">Alta</span>`;
    }
    if (priority === 'Baja') {
        return `<span class="badge text-bg-secondary">Baja</span>`;
    }
    return `<span class="badge text-bg-warning">Media</span>`;
}

// Cambia textos del modal/botón de acuerdo con modo crear o editar.
function setFormMode(isEdit) {
    modalTitle.textContent = isEdit ? 'Editar Prospecto' : 'Agregar Nuevo Prospecto';
    saveProspectBtn.textContent = isEdit ? 'Actualizar' : 'Guardar';
}

// Restablece formulario a estado inicial para alta de prospecto.
function resetForm() {
    prospectForm.reset();
    prospectIdInput.value = "";
    prospectPriorityInput.value = "Media";
    prospectStatusInput.value = "Activo";
    setFormMode(false);
}

// Recalcula KPI total y KPI de prospectos activos.
function updateKPIs() {
    totalProspects.textContent = prospectsCache.length;
    activeProspects.textContent = prospectsCache.filter(
        (item) => item.status === 'Activo'
    ).length;
}

// Renderiza tabla de prospectos o mensaje vacío cuando no hay resultados.
function renderTable(data) {
    if (!Array.isArray(data) || data.length === 0) {
        prospectsTable.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">No hay prospectos disponibles.</td>
            </tr>
        `;
        return;
    }

    prospectsTable.innerHTML = data.map((prospect) => {
        const safeName = escapeHTML(prospect.name);
        const safeCompany = escapeHTML(prospect.company);
        const safePhone = escapeHTML(prospect.phone || '-');
        const safeEmail = escapeHTML(prospect.email || '-');
        const safePriority = escapeHTML(prospect.priority);
        const safeStatus = escapeHTML(prospect.status);
        const statusClass = prospect.status === 'Activo'
            ? 'status-active'
            : 'status-inactive';

        return `
            <tr>
                <td>${safeName}</td>
                <td>${safeCompany}</td>
                <td>${safePhone}</td>
                <td>${safeEmail}</td>
                <td>${getPriority(safePriority)}</td>
                <td><span class="${statusClass}">${safeStatus}</span></td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-secondary me-2 edit-prospect"
                        data-id="${getProspectId(prospect)}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-prospect"
                        data-id="${getProspectId(prospect)}">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Consulta prospectos con parámetros de búsqueda y filtro de estatus.
async function fetchProspects() {
    const params = new URLSearchParams();
    const searchValue = searchInput.value.trim();
    const statusValue = statusFilter.value;

    if (searchValue) params.append('search', searchValue);
    if (statusValue) params.append('status', statusValue);

    const response = await apiFetch(`/api/prospects?${params.toString()}`);
    if (!response.ok) {
        throw new Error('No se pudo cargar la lista de prospectos');
    }

    const payload = await response.json();
    prospectsCache = payload.data || [];

    renderTable(prospectsCache);
    updateKPIs();
}

// Guarda prospecto (POST/PUT) según exista o no un id en el formulario.
async function saveProspect(event) {
    event.preventDefault();

    const payload = {
        name: prospectNameInput.value.trim(),
        company: prospectCompanyInput.value.trim(),
        phone: prospectPhoneInput.value.trim(),
        email: prospectEmailInput.value.trim(),
        priority: prospectPriorityInput.value,
        status: prospectStatusInput.value
    };

    const id = prospectIdInput.value;
    const endpoint = id
        ? `/api/prospects/${id}`
        : `/api/prospects`;

    const method = id ? 'PUT' : 'POST';

    const response = await apiFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
        throw new Error(result.message || 'Error al guardar el prospecto');
    }

    addProspectModal?.hide();
    resetForm();
    await fetchProspects();
}

// Elimina un prospecto con confirmación y recarga la tabla.
async function deleteProspect(id) {
    const confirmed = await showConfirm(
        '¿Estás seguro de que deseas eliminar este prospecto?'
    );
    if (!confirmed) return;

    const response = await apiFetch(`/api/prospects/${id}`, {
        method: 'DELETE'
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
        throw new Error(result.message || 'Error al eliminar el prospecto');
    }

    await fetchProspects();
}

// Carga datos del prospecto seleccionado en el modal para edición.
function loadProspectsInForm(id) {
    const selected = prospectsCache.find(
        (item) => Number(getProspectId(item)) === Number(id)
    );
    if (!selected) return;

    prospectIdInput.value = getProspectId(selected);
    prospectNameInput.value = selected.name;
    prospectEmailInput.value = selected.email;
    prospectPhoneInput.value = selected.phone;
    prospectCompanyInput.value = selected.company;
    prospectPriorityInput.value = selected.priority;
    prospectStatusInput.value = selected.status;

    setFormMode(true);
    addProspectModal.show();
}

// Registra listeners de formulario, filtros y acciones de tabla.
if (prospectForm && prospectsTable && searchInput && statusFilter) {
    prospectForm.addEventListener('submit', async (event) => {
        try {
            await saveProspect(event);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    openAddProspectBtn?.addEventListener('click', () => {
        resetForm();
    });

    // Refresca resultados en vivo al buscar o cambiar estatus.
    searchInput.addEventListener('input', fetchProspects);
    statusFilter.addEventListener('change', fetchProspects);

    // Maneja edición/eliminación con delegación de eventos.
    prospectsTable.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('.edit-prospect');
        if (editBtn) {
            loadProspectsInForm(editBtn.dataset.id);
            return;
        }

        const deleteBtn = event.target.closest('.delete-prospect');
        if (deleteBtn) {
            try {
                await deleteProspect(deleteBtn.dataset.id);
            } catch (error) {
                await showAlert(error.message);
            }
        }
    });

    // Carga inicial con estado de error visible en la tabla.
    fetchProspects().catch((error) => {
        prospectsTable.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-danger">
                    Error al cargar prospectos: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    });
}
})();