(() => {
// ===============================
// VARIABLES GLOBALES
// ===============================

let conceptos = [];
let listaProspectos = [];
const editId = window.currentCotizacionId || null;

// ===============================
// ELEMENTOS DEL DOM
// ===============================

const cotizacionForm = document.getElementById('addCotizacionForm');
const cotizacionProspecto = document.getElementById('cotizacionProspecto');
const cotizacionMoneda = document.getElementById('cotizacionMoneda');
const cotizacionTipoCambio = document.getElementById('cotizacionTipoCambio');

const addConceptoBtn = document.getElementById("addConceptoBtn");
const conceptosContainer = document.getElementById("conceptosContainer");

const prospectoSearch = document.getElementById("cotizacionProspectoSearch");
const prospectosDropdown = document.getElementById("prospectosDropdown");
const prospectoHidden = document.getElementById("cotizacionProspecto");

// ===============================
// CARGAR PROSPECTOS
// ===============================

async function cargarProspects() {
  try {
    const response = await fetch('/api/prospects?status=Activo');
    const result = await response.json();

    if (!result.success) return;

    listaProspectos = result.data;

  } catch (error) {
    console.error("Error cargando prospectos:", error);
  }
}

prospectoSearch.addEventListener("input", () => {
  const texto = prospectoSearch.value.toLowerCase();

  prospectosDropdown.innerHTML = "";

  if (texto.length === 0) {
    prospectosDropdown.style.display = "none";
    return;
  }

  const filtrados = listaProspectos.filter(p =>
    p.company.toLowerCase().includes(texto)
  );

  if (filtrados.length === 0) {
    prospectosDropdown.style.display = "none";
    return;
  }

  filtrados.forEach(p => {
    const item = document.createElement("div");
    item.classList.add("dropdown-item-autocomplete");
    item.textContent = p.company;

    item.addEventListener("click", () => {
      prospectoSearch.value = p.company;
      prospectoHidden.value = p.id_prospect;
      prospectosDropdown.style.display = "none";
    });

    prospectosDropdown.appendChild(item);
  });

  prospectosDropdown.style.display = "block";
});

prospectoSearch.addEventListener("focus", () => {

  prospectosDropdown.innerHTML = "";

  if (listaProspectos.length === 0) return;

  listaProspectos.forEach(p => {

    const item = document.createElement("div");
    item.classList.add("dropdown-item-autocomplete");
    item.textContent = p.company;

    item.addEventListener("click", () => {
      prospectoSearch.value = p.company;
      prospectoHidden.value = p.id_prospect;
      prospectosDropdown.style.display = "none";
    });

    prospectosDropdown.appendChild(item);
  });

  prospectosDropdown.style.display = "block";
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".position-relative")) {
    prospectosDropdown.style.display = "none";
  }
});

// ===============================
// CONTROL TIPO CAMBIO
// ===============================

function controlarTipoCambio() {
  if (cotizacionMoneda.value === "MXN") {
    cotizacionTipoCambio.value = 1;
    cotizacionTipoCambio.disabled = true;
  } else {
    cotizacionTipoCambio.disabled = false;
  }
}

cotizacionMoneda.addEventListener("change", () => {
  controlarTipoCambio()
  actualizarTotal();
});

cotizacionTipoCambio.addEventListener("input", actualizarTotal);

// ===============================
// AGREGAR CONCEPTO
// ===============================

addConceptoBtn.addEventListener("click", () => {

  const index = conceptos.length;

  const card = document.createElement("div");
  card.className = "card p-3 mb-3";

  card.innerHTML = `
    <div class="row g-2">
      <div class="col-md-8">
        <label class="form-label">Descripción</label>
        <textarea class="form-control descripcion" rows="7"></textarea>
      </div>
      <div class="col-md-2">
        <label class="form-label">Periodicidad</label>
        <select class="form-select periodicidad">
          <option value="Pago Unico">Pago Unico</option>
          <option value="Mensual">Mensual</option>
          <option value="Anual">Anual</option>
        </select>

        <label class="form-label">Cantidad</label>
        <input type="number" class="form-control cantidad" value="1" min="1">

        <label class="form-label">Costo Unitario</label>
        <input type="number" class="form-control costo" value="0" step="0.01">
      </div>
      <div class="col-md-2 d-flex align-items-end">
        <button type="button" class="btn btn-danger btnEliminar w-100">
          Eliminar
        </button>
      </div>
    </div>
  `;

  card.querySelector(".btnEliminar").addEventListener("click", () => {
    card.remove();
    actualizarTotal();
  });

  card.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", actualizarTotal);
  });

  const textarea = card.querySelector(".descripcion");
  textarea.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = this.scrollHeight + "px";
  });

  conceptosContainer.appendChild(card);

  actualizarTotal();
});

// ===============================
// CALCULAR TOTAL GENERAL
// ===============================


function actualizarTotal() {

  const cards = conceptosContainer.querySelectorAll(".card");
  let subtotal = 0;

  const moneda = cotizacionMoneda.value;
  const tipoCambio = Number(cotizacionTipoCambio.value) || 1;

  cards.forEach(card => {

    const cantidad = parseFloat(card.querySelector(".cantidad")?.value) || 0;
    const costo = parseFloat(card.querySelector(".costo")?.value) || 0;

    let importe = 0;

    if (moneda === "USD") {
      importe = cantidad * costo * tipoCambio;
    } else {
      importe = cantidad * costo;
    }

    subtotal += importe;
  });

  const iva = subtotal * 0.16;
  const total = subtotal + iva;

  document.getElementById("subtotalGeneral").textContent =
    "$" + subtotal.toLocaleString("es-MX", { minimumFractionDigits: 2 });

  document.getElementById("ivaGeneral").textContent =
    "$" + iva.toLocaleString("es-MX", { minimumFractionDigits: 2 });

  document.getElementById("totalGeneral").textContent =
    "$" + total.toLocaleString("es-MX", { minimumFractionDigits: 2 });
}


// ===============================
// GUARDAR / EDITAR COTIZACIÓN
// ===============================

cotizacionForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!cotizacionProspecto.value) {
    alert("Selecciona un prospecto");
    return;
  }

  const cards = conceptosContainer.querySelectorAll(".card");

  if (cards.length === 0) {
    alert("Agrega al menos un concepto");
    return;
  }

  const conceptosValidos = [];

  cards.forEach(card => {
    const descripcion = card.querySelector(".descripcion").value.trim();
    const periodicidad = card.querySelector(".periodicidad").value;
    const cantidad = Number(card.querySelector(".cantidad").value);
    const costo = Number(card.querySelector(".costo").value);

    if (descripcion && cantidad > 0 && costo > 0) {
      conceptosValidos.push({
        descripcion,
        periodicidad,
        cantidad,
        costo_unitario: costo
      });
    }
  });

  if (conceptosValidos.length === 0) {
    alert("Conceptos inválidos");
    return;
  }

  const payload = {
    id_prospect: Number(cotizacionProspecto.value),
    moneda: cotizacionMoneda.value,
    tipo_cambio:
      cotizacionMoneda.value === "MXN"
        ? 1
        : Number(cotizacionTipoCambio.value || 1),
    conceptos: conceptosValidos
  };

  const url = editId
    ? `/api/cotizaciones/${editId}`
    : `/api/cotizaciones`;

  const method = editId ? "PUT" : "POST";

  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.message || "Error guardando");
      return;
    }

    loadView(
      "views/cotizacion.html",
      "css/cotizacion.css",
      "js/cotizacion.js"
    );

  } catch (error) {
    console.error("Error:", error);
    alert("Error del servidor");
  }
});

// ===============================
// CARGAR COTIZACIÓN EN MODO EDIT
// ===============================

async function cargarCotizacion(id) {

  try {

    const res = await fetch(`/api/cotizaciones/${id}`);
    const data = await res.json();

    if (!data.success) return;

    const cot = data.data;

    cotizacionProspecto.value = cot.id_prospect;
    cotizacionMoneda.value = cot.moneda;
    cotizacionTipoCambio.value = cot.tipo_cambio;

    conceptos = cot.conceptos || [];

    conceptosContainer.innerHTML = "";

    cot.conceptos.forEach(c => {

      const card = document.createElement("div");
      card.className = "card p-3 mb-3";

      card.innerHTML = `
        <div class="row g-2">
          <div class="col-md-8">
            <label class="form-label">Descripción</label>
            <textarea class="form-control descripcion">${c.descripcion}</textarea>
          </div>
          <div class="col-md-2">
            <label class="form-label">Periodicidad</label>
            <select class="form-select periodicidad">
              <option ${c.periodicidad === "Pago Unico" ? "selected" : ""}>Pago Unico</option>
              <option ${c.periodicidad === "Mensual" ? "selected" : ""}>Mensual</option>
              <option ${c.periodicidad === "Anual" ? "selected" : ""}>Anual</option>
            </select>

            <label class="form-label">Cantidad</label>
            <input type="number" class="form-control cantidad" value="${c.cantidad}">

            <label class="form-label">Costo Unitario</label>
            <input type="number" class="form-control costo" value="${c.costo_unitario}">
          </div>
        </div>
      `;

      conceptosContainer.appendChild(card);
    });

    actualizarTotal();

    controlarTipoCambio();

  } catch (error) {
    console.error("Error cargando cotización:", error);
  }
}


// ===============================
// REGRESAR VISTA
// ===============================

const cancelBtn = document.getElementById("cancelCotizacionBtn");

cancelBtn.addEventListener("click", () => {
  loadView(
    "views/cotizacion.html",
    "css/cotizacion.css",
    "js/cotizacion.js"
  );
});

// ===============================
// INICIALIZACIÓN
// ===============================

(async () => {
  await cargarProspects();
  controlarTipoCambio();

  if (editId) {
    cargarCotizacion(editId);
  }

})();

})();