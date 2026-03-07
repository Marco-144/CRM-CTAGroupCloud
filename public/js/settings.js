(() => {
const usersTableBody = document.getElementById('usersTableBody');
const userForm = document.getElementById('userForm');
const openUserModalBtn = document.getElementById('openUserModal');
const saveUserBtn = document.getElementById('saveUserBtn');
const userModalTitle = document.getElementById('userModalTitle');
const showAlert = window.showAppAlert || ((message) => Promise.resolve(window.alert(message)));
const showConfirm = window.showAppConfirm || ((message) => Promise.resolve(window.confirm(message)));

const userIdInput = document.getElementById('userId');
const userNameInput = document.getElementById('userName');
const userEmailInput = document.getElementById('userEmail');
const userDepartmentInput = document.getElementById('userDepartment');
const userRoleInput = document.getElementById('userRole');
const userPasswordInput = document.getElementById('userPassword');

const userModalElement = document.getElementById('userModal');
const userModal = userModalElement
	? bootstrap.Modal.getOrCreateInstance(userModalElement)
	: null;

let usersCache = [];
let departmentsCache = [];
let rolesCache = [];

function escapeHTML(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function resetForm() {
	userForm.reset();
	userIdInput.value = '';
	userDepartmentInput.value = '';
	userRoleInput.value = '';
	userPasswordInput.required = true;
	userModalTitle.textContent = 'Agregar Usuario';
	saveUserBtn.textContent = 'Guardar';
}

function setEditMode() {
	userPasswordInput.required = false;
	userModalTitle.textContent = 'Editar Usuario';
	saveUserBtn.textContent = 'Actualizar';
}

function renderUsersTable(users) {
	if (!Array.isArray(users) || users.length === 0) {
		usersTableBody.innerHTML = `
			<tr>
				<td colspan="5" class="text-center">No hay usuarios registrados.</td>
			</tr>
		`;
		return;
	}

	usersTableBody.innerHTML = users.map((item) => {
		const safeUser = escapeHTML(item.username || '-');
		const safeEmail = escapeHTML(item.email || '-');
		const safeDepartment = escapeHTML(item.department || '-');
		const safeRole = escapeHTML(item.role || '-');

		return `
			<tr>
				<td>${safeUser}</td>
				<td>${safeEmail}</td>
				<td>${safeDepartment}</td>
				<td>${safeRole}</td>
				<td class="text-end">
					<button class="btn btn-sm btn-outline-secondary me-2 edit-user" data-id="${item.id}">
						<i class="bi bi-pencil"></i>
					</button>
					<button class="btn btn-sm btn-outline-danger delete-user" data-id="${item.id}">
						<i class="bi bi-trash"></i>
					</button>
				</td>
			</tr>
		`;
	}).join('');
}

async function fetchUsers() {
	const response = await fetch('/api/users');
	const payload = await response.json().catch(() => ({}));

	if (!response.ok || payload.success === false) {
		throw new Error(payload.message || 'No se pudo cargar la lista de usuarios');
	}

	usersCache = payload.data || [];
	renderUsersTable(usersCache);
}

function renderSelectOptions(selectElement, items, valueKey, textKey, placeholderText) {
	selectElement.innerHTML = `<option value="" disabled selected>${placeholderText}</option>`;

	items.forEach((item) => {
		const option = document.createElement('option');
		option.value = String(item[valueKey]);
		option.textContent = item[textKey];
		selectElement.appendChild(option);
	});
}

async function fetchDepartmentsAndRoles() {
	const [departmentsResponse, rolesResponse] = await Promise.all([
		fetch('/api/departments'),
		fetch('/api/roles')
	]);

	const departmentsPayload = await departmentsResponse.json().catch(() => ({}));
	const rolesPayload = await rolesResponse.json().catch(() => ({}));

	if (!departmentsResponse.ok || departmentsPayload.success === false) {
		throw new Error(departmentsPayload.message || 'No se pudieron cargar los departamentos');
	}

	if (!rolesResponse.ok || rolesPayload.success === false) {
		throw new Error(rolesPayload.message || 'No se pudieron cargar los roles');
	}

	departmentsCache = departmentsPayload.data || [];
	rolesCache = rolesPayload.data || [];

	renderSelectOptions(
		userDepartmentInput,
		departmentsCache,
		'id_department',
		'name',
		'Selecciona un departamento'
	);

	renderSelectOptions(
		userRoleInput,
		rolesCache,
		'id_role',
		'name',
		'Selecciona un rol'
	);
}

function openEditUser(userId) {
	const selectedUser = usersCache.find((item) => Number(item.id) === Number(userId));
	if (!selectedUser) return;

	userIdInput.value = selectedUser.id;
	userNameInput.value = selectedUser.username || '';
	userEmailInput.value = selectedUser.email || '';
	userDepartmentInput.value = String(selectedUser.id_department || '');
	userRoleInput.value = String(selectedUser.id_role || '');
	userPasswordInput.value = '';

	setEditMode();
	userModal?.show();
}

async function saveUser(event) {
	event.preventDefault();

	const id = userIdInput.value;
	const payload = {
		username: userNameInput.value.trim(),
		email: userEmailInput.value.trim(),
		id_department: Number(userDepartmentInput.value),
		id_role: Number(userRoleInput.value),
		password: userPasswordInput.value
	};

	if (!id && !payload.password) {
		throw new Error('La contraseña es obligatoria para agregar usuarios.');
	}

	if (id && !payload.password) {
		delete payload.password;
	}

	const endpoint = id ? `/api/users/${id}` : '/api/users';
	const method = id ? 'PUT' : 'POST';

	const response = await fetch(endpoint, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});

	const result = await response.json().catch(() => ({}));
	if (!response.ok || result.success === false) {
		throw new Error(result.message || 'No se pudo guardar el usuario.');
	}

	userModal?.hide();
	resetForm();
	await fetchUsers();
}

async function removeUser(id) {
	const confirmed = await showConfirm('¿Deseas eliminar este usuario?');
	if (!confirmed) return;

	const response = await fetch(`/api/users/${id}`, {
		method: 'DELETE'
	});

	const result = await response.json().catch(() => ({}));
	if (!response.ok || result.success === false) {
		throw new Error(result.message || 'No se pudo eliminar el usuario.');
	}

	await fetchUsers();
}

if (usersTableBody && userForm) {
	openUserModalBtn?.addEventListener('click', () => {
		resetForm();
	});

	userForm.addEventListener('submit', async (event) => {
		try {
			await saveUser(event);
		} catch (error) {
			await showAlert(error.message);
		}
	});

	usersTableBody.addEventListener('click', async (event) => {
		const editBtn = event.target.closest('.edit-user');
		if (editBtn) {
			openEditUser(editBtn.dataset.id);
			return;
		}

		const deleteBtn = event.target.closest('.delete-user');
		if (deleteBtn) {
			try {
				await removeUser(deleteBtn.dataset.id);
			} catch (error) {
				await showAlert(error.message);
			}
		}
	});

	Promise.all([fetchDepartmentsAndRoles(), fetchUsers()]).catch((error) => {
		usersTableBody.innerHTML = `
			<tr>
				<td colspan="5" class="text-center text-danger">
					Error al cargar usuarios: ${escapeHTML(error.message)}
				</td>
			</tr>
		`;
	});
}
})();
