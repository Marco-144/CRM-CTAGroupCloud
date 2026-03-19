(() => {

    const grid = document.getElementById("bitacorasGrid");
    const searchInput = document.getElementById("searchBitacoras");
    const addBtn = document.getElementById("openAddBitacora");

    // Validar que los elementos existan
    if (!grid || !searchInput || !addBtn) {
        console.error("Error: No se encontraron los elementos necesarios en el DOM");
        return;
    }

    // Consulta bitácoras al backend con el texto de búsqueda actual.
    async function loadBitacoras() {
        try {
            const search = searchInput.value.trim();

            const res = await apiFetch(`/api/bitacoras?search=${search}`);
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.message || "Error al cargar bitácoras");
            }

            render(data.data);
        } catch (error) {
            console.error("Error:", error);
            grid.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    }

    // Renderiza tarjetas con acciones de PDF, edición y eliminación.
    function render(data) {
        if (!data || !data.length) {
            grid.innerHTML = `<div class="alert alert-info">No hay bitácoras registradas</div>`;
            return;
        }

        grid.innerHTML = data.map(b => `
            <div class="bitacora-card">
                <div class="bitacora-content">
                    <div class="bitacora-title">${escapeHtml(b.titulo)}</div>
                    <div class="bitacora-meta">
                        <small class="text-muted">
                            <i class="bi bi-calendar-event"></i>
                            ${new Date(b.created_at).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })}
                        </small>
                    </div>
                    <div class="bitacora-preview">${escapeHtml(b.preview || "Sin descripción")}</div>
                </div>
                <div class="bitacora-actions">
                    <button class="btn btn-sm btn-outline-secondary" onclick="downloadBitacoraPdf(${b.id_bitacora})"
                        title="Descargar PDF">
                        <i class="bi bi-file-earmark-pdf"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-primary" onclick="editBitacora(${b.id_bitacora})" 
                        title="Editar">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteBitacora(${b.id_bitacora})" 
                        title="Eliminar">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join("");
    }

    window.editBitacora = (id) => {
        window.__bitacoraEditId = id;
        loadView("views/addBitacoras.html", "css/addBitacoras.css", "js/addBitacoras.js");
    };

    window.deleteBitacora = async (id) => {
        if (!confirm("¿Estás seguro de que deseas eliminar esta bitácora?")) {
            return;
        }

        try {
            const res = await apiFetch(`/api/bitacoras/${id}`, {
                method: "DELETE"
            });
            const data = await res.json();

            if (!data.success) {
                throw new Error(data.message || "Error al eliminar");
            }

            alert(data.message || "Bitácora eliminada correctamente");
            loadBitacoras();
        } catch (error) {
            console.error("Error:", error);
            alert("Error: " + error.message);
        }
    };

    window.downloadBitacoraPdf = async (id) => {
        await openBitacoraPdf(id);
    };

    // Abre el PDF autenticado en una nueva pestaña para previsualización rápida.
    async function openBitacoraPdf(id) {
        try {
            const token = sessionStorage.getItem("authToken");
            if (!token) {
                throw new Error("Sesión inválida. Inicia sesión nuevamente.");
            }

            const pdfUrl = `/api/bitacoras/${id}/export/pdf?token=${encodeURIComponent(token)}`;
            window.open(pdfUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            console.error("Error abriendo PDF:", error);
            alert("No se pudo abrir el PDF: " + error.message);
        }
    }

    function escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    // Event listeners
    searchInput.addEventListener("input", loadBitacoras);

    addBtn.addEventListener("click", (e) => {
        e.preventDefault();
        window.__bitacoraEditId = null;
        loadView("views/addBitacoras.html", "css/addBitacoras.css", "js/addBitacoras.js");
    });

    // Inicializa la vista cargando datos al entrar.
    loadBitacoras();
})();