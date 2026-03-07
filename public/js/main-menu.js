const sidebar = document.getElementById('sidebar');
const toggle = document.getElementById('toggleSidebar');
const commercialCollapse = document.getElementById('commercialSub');
const accountCollapse = document.getElementById('accountingSub');
const logoutBtn = document.getElementById('logoutBtn');
let latestViewRequestId = 0;
let appDialogRefs = null;

function clearSessionAndRedirect() {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('loggedUser');
    sessionStorage.removeItem('loggedUserData');
    window.location.href = 'login.html';
}

function handleLogoutClick(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    clearSessionAndRedirect();
}

async function validateSession() {
    const token = sessionStorage.getItem('authToken');

    if (!token) {
        clearSessionAndRedirect();
        return false;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            clearSessionAndRedirect();
            return false;
        }

        const payload = await response.json().catch(() => ({}));
        const username = payload?.user?.username;

        if (!payload?.success || !username) {
            clearSessionAndRedirect();
            return false;
        }

        sessionStorage.setItem('loggedUser', username);
        sessionStorage.setItem('loggedUserData', JSON.stringify(payload.user));
        return true;
    } catch (error) {
        clearSessionAndRedirect();
        return false;
    }
}

function getAppDialogRefs() {
    if (appDialogRefs) return appDialogRefs;

    let modalEl = document.getElementById('appMessageModal');
    if (!modalEl) {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
            <div class="modal fade" id="appMessageModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="appMessageTitle">Mensaje</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="appMessageBody"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" id="appMessageCancel">Cancelar</button>
                            <button type="button" class="btn btn-primary" id="appMessageOk">Aceptar</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper.firstElementChild);
        modalEl = document.getElementById('appMessageModal');
    }

    appDialogRefs = {
        modalEl,
        modal: bootstrap.Modal.getOrCreateInstance(modalEl),
        titleEl: modalEl.querySelector('#appMessageTitle'),
        bodyEl: modalEl.querySelector('#appMessageBody'),
        cancelBtn: modalEl.querySelector('#appMessageCancel'),
        okBtn: modalEl.querySelector('#appMessageOk')
    };

    return appDialogRefs;
}

window.showAppAlert = function(message, title = 'Mensaje') {
    const refs = getAppDialogRefs();

    refs.titleEl.textContent = title;
    refs.bodyEl.textContent = String(message || '');
    refs.cancelBtn.classList.add('d-none');
    refs.okBtn.textContent = 'Aceptar';

    return new Promise((resolve) => {
        refs.okBtn.onclick = () => {
            refs.modal.hide();
            resolve();
        };

        refs.modalEl.addEventListener('hidden.bs.modal', () => {
            resolve();
        }, { once: true });

        refs.modal.show();
    });
};

window.showAppConfirm = function(message, title = 'Confirmar acción') {
    const refs = getAppDialogRefs();
    let userConfirmed = false;

    refs.titleEl.textContent = title;
    refs.bodyEl.textContent = String(message || '');
    refs.cancelBtn.classList.remove('d-none');
    refs.cancelBtn.textContent = 'Cancelar';
    refs.okBtn.textContent = 'Confirmar';

    return new Promise((resolve) => {
        refs.okBtn.onclick = () => {
            userConfirmed = true;
            refs.modal.hide();
        };

        refs.cancelBtn.onclick = () => {
            userConfirmed = false;
            refs.modal.hide();
        };

        refs.modalEl.addEventListener('hidden.bs.modal', () => {
            resolve(userConfirmed);
        }, { once: true });

        refs.modal.show();
    });
};

// Accion de despliegue del sidebar
toggle.addEventListener('click', function() {

    const logoImage = document.getElementById('logoImage');
    
    logoImage.style.opacity = 0; 

    setTimeout(() => {

        sidebar.classList.toggle('collapsed');

        if (sidebar.classList.contains('collapsed')) {
            logoImage.src = 'assets/CTA-Icon.png';

            const collapsebs = bootstrap.Collapse.getInstance(commercialCollapse);
            const collapsebs2 = bootstrap.Collapse.getInstance(accountCollapse);
            if (collapsebs || collapsebs2) {
                collapsebs.hide();
                collapsebs2.hide();
            }

        } else {
            logoImage.src = 'assets/LOGO HORIZONTAL-02.png';
        }
        logoImage.style.opacity = 1;
    }, 300);
});

//Funcion para actualizar el mensaje de bienvenida con el nombre del usuario logueado.
function updateWelcomeMessage() {
    const welcomeMessage = document.getElementById('welcomeMessage');
    if (!welcomeMessage) return;

    const loggedUser = sessionStorage.getItem('loggedUser') || 'Usuario';
    welcomeMessage.textContent = `Hola ${loggedUser} 👋`;
}

function addCollapseIconsToNavItems() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach((item) => {
        const hasSubCategory = item.querySelector(':scope > .subCategory') !== null;
        if (!hasSubCategory) return;

        const toggleLink = item.querySelector(':scope > .nav-link[data-bs-toggle="collapse"]');
        if (!toggleLink) return;

        const iconExists = toggleLink.querySelector('.dropdown-icon') !== null;
        if (iconExists) return;

        const icon = document.createElement('i');
        icon.className = 'bi bi-chevron-down dropdown-icon';
        icon.setAttribute('aria-hidden', 'true');
        toggleLink.appendChild(icon);
    });
}

// Cargar las diferentes secciones del dashboard
document.addEventListener('DOMContentLoaded', async function() {
    const isSessionValid = await validateSession();
    if (!isSessionValid) return;

    addCollapseIconsToNavItems();
    loadView('views/dashboard.html');

    logoutBtn?.addEventListener('click', handleLogoutClick);
});

document.addEventListener('click', function(event) {
    const target = event.target.closest('#logoutBtn');
    if (!target) return;
    handleLogoutClick(event);
});

function loadView(view, cssFile = null, jsFile = null) {
    const requestId = ++latestViewRequestId;

    fetch(view)
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar la vista');
            }
            return response.text();
        })
        .then(data => {
            if (requestId !== latestViewRequestId) {
                return;
            }

            document.getElementById('content-area').innerHTML = data;
            updateWelcomeMessage();

            // Remover CSS anterior de vista
            const oldCss = document.getElementById('dynamic-css');
            if (oldCss) oldCss.remove();

            // Remover JS anterior de vista
            const oldJs = document.getElementById('dynamic-js');
            if (oldJs) oldJs.remove();

            // Cargar nuevo CSS
            if (cssFile) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = cssFile;
                link.id = 'dynamic-css';
                document.head.appendChild(link);
            }

            // Cargar nuevo JS
            if (jsFile) {
                const script = document.createElement('script');
                script.src = jsFile;
                script.id = 'dynamic-js';
                document.body.appendChild(script);
            }
        })
        .catch(error => {
            if (requestId !== latestViewRequestId) {
                return;
            }
            document.getElementById('content-area').innerHTML = '<h4>Error al cargar la vista</h4>';
        });
}