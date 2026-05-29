(() => {
    const tableBody = document.getElementById("payrollEmployeesTableBody");
    const form = document.getElementById("payrollEmployeeForm");
    const openBtn = document.getElementById("openPayrollEmployeeModal");
    const saveBtn = document.getElementById("savePayrollEmployeeBtn");
    const modalTitle = document.getElementById("payrollEmployeeModalTitle");

    const idInput = document.getElementById("payrollEmployeeId");
    const userInput = document.getElementById("payrollEmployeeUser");
    const salaryInput = document.getElementById("payrollEmployeeSalary");
    const frequencyInput = document.getElementById("payrollEmployeeFrequency");
    const startDateInput = document.getElementById("payrollEmployeeStartDate");
    const activeInput = document.getElementById("payrollEmployeeActive");

    const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
    const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

    const modalElement = document.getElementById("payrollEmployeeModal");
    const modal = modalElement ? bootstrap.Modal.getOrCreateInstance(modalElement) : null;

    let usersCache = [];
    let employeesCache = [];

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatMoney(value, currency = "MXN") {
        return new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency,
            minimumFractionDigits: 2,
        }).format(Number(value || 0));
    }

    function formatDate(value) {
        if (!value) return "-";
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "-";
        return d.toLocaleDateString("es-MX");
    }

    function resetForm() {
        form.reset();
        idInput.value = "";
        userInput.value = "";
        salaryInput.value = "";
        frequencyInput.value = "";
        startDateInput.value = new Date().toISOString().slice(0, 10);
        activeInput.checked = true;

        userInput.disabled = false;
        modalTitle.textContent = "Agregar Empleado";
        saveBtn.textContent = "Guardar";
    }

    function renderUserOptions(selectedUserId = "") {
        const takenUsers = new Set(
            employeesCache
                .filter((item) => String(item.id_payroll_employee) !== String(idInput.value || ""))
                .map((item) => Number(item.id_user))
        );

        userInput.innerHTML = '<option value="" disabled selected>Selecciona un usuario</option>';

        usersCache.forEach((user) => {
            const userId = Number(user.id);
            const option = document.createElement("option");
            option.value = String(userId);
            option.textContent = `${user.name || user.username}`;
            option.disabled = takenUsers.has(userId);
            userInput.appendChild(option);
        });

        if (selectedUserId) {
            userInput.value = String(selectedUserId);
        }
    }

    function renderTable(rows) {
        if (!Array.isArray(rows) || !rows.length) {
            tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No hay empleados registrados.</td></tr>';
            return;
        }

        tableBody.innerHTML = rows.map((item) => {
            const statusBadge = Number(item.is_active) === 1
                ? '<span class="badge text-bg-success">Activo</span>'
                : '<span class="badge text-bg-secondary">Inactivo</span>';

            return `
                <tr>
                    <td data-label="Empleado">${escapeHTML(item.employee_name || "-")}</td>
                    <td data-label="Sueldo Neto">${formatMoney(item.salary_net)}</td>
                    <td data-label="Periodicidad">${escapeHTML(item.pay_frequency || "-")}</td>
                    <td data-label="Inicio">${formatDate(item.start_date)}</td>
                    <td data-label="Estatus">${statusBadge}</td>
                    <td data-label="Saldo Pendiente">${formatMoney(item.total_pending)}</td>
                    <td class="text-end" data-label="Acciones">
                        <button class="btn btn-sm btn-outline-secondary me-2 edit-payroll-employee" data-id="${item.id_payroll_employee}">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-payroll-employee" data-id="${item.id_payroll_employee}">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join("");
    }

    async function fetchUsers() {
        const response = await apiFetch("/api/payroll/users");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudieron cargar los usuarios");
        }

        usersCache = payload.data || [];
    }

    async function fetchEmployees() {
        const response = await apiFetch("/api/payroll/employees");
        const payload = await response.json().catch(() => ({}));

        if (!response.ok || payload.success === false) {
            throw new Error(payload.message || "No se pudieron cargar los empleados");
        }

        employeesCache = payload.data || [];
        renderTable(employeesCache);
        renderUserOptions();
    }

    function openEditMode(employeeId) {
        const selected = employeesCache.find((item) => Number(item.id_payroll_employee) === Number(employeeId));
        if (!selected) return;

        idInput.value = String(selected.id_payroll_employee);
        renderUserOptions(selected.id_user);
        userInput.disabled = true;

        salaryInput.value = Number(selected.salary_net || 0);
        frequencyInput.value = selected.pay_frequency || "";
        startDateInput.value = String(selected.start_date || "").slice(0, 10);
        activeInput.checked = Number(selected.is_active) === 1;

        modalTitle.textContent = "Editar Empleado";
        saveBtn.textContent = "Actualizar";
        modal?.show();
    }

    async function saveEmployee(event) {
        event.preventDefault();

        const isEditing = Boolean(idInput.value);

        const payload = {
            salary_net: Number(salaryInput.value),
            pay_frequency: frequencyInput.value,
            start_date: startDateInput.value,
            is_active: activeInput.checked,
        };

        if (!isEditing) {
            payload.id_user = Number(userInput.value);
        }

        const endpoint = isEditing
            ? `/api/payroll/employees/${idInput.value}`
            : "/api/payroll/employees";

        const method = isEditing ? "PUT" : "POST";

        const response = await apiFetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            throw new Error(result.message || "No se pudo guardar el empleado");
        }

        modal?.hide();
        resetForm();
        await fetchEmployees();
    }

    async function removeEmployee(id) {
        const confirmed = await showConfirm("¿Deseas eliminar este empleado de nomina?");
        if (!confirmed) return;

        const response = await apiFetch(`/api/payroll/employees/${id}`, {
            method: "DELETE",
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false) {
            throw new Error(result.message || "No se pudo eliminar el empleado");
        }

        await fetchEmployees();
    }

    if (!tableBody || !form) return;

    openBtn?.addEventListener("click", () => {
        resetForm();
        renderUserOptions();
    });

    form.addEventListener("submit", async (event) => {
        try {
            await saveEmployee(event);
        } catch (error) {
            await showAlert(error.message);
        }
    });

    tableBody.addEventListener("click", async (event) => {
        const editBtn = event.target.closest(".edit-payroll-employee");
        if (editBtn) {
            openEditMode(editBtn.dataset.id);
            return;
        }

        const deleteBtn = event.target.closest(".delete-payroll-employee");
        if (deleteBtn) {
            try {
                await removeEmployee(deleteBtn.dataset.id);
            } catch (error) {
                await showAlert(error.message);
            }
        }
    });

    Promise.all([fetchUsers(), fetchEmployees()]).catch((error) => {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${escapeHTML(error.message)}</td></tr>`;
    });
})();
