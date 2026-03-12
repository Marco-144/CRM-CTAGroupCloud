async function loadDashboardKpis() {
    try {
        // Cargar ventas
        const salesRes = await apiFetch("/api/sales");
        const salesPayload = await salesRes.json();

        if (salesPayload.success) {
            const sales = salesPayload.data || [];

            // Total de ventas activas y suma de ventas del mes en curso.
            let totalVentas = 0;
            let ventasMes = 0;

            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            sales.forEach(sale => {
                const amount = Number(sale.total || 0);
                const saleStatus = String(sale.sale_status || "").trim().toLowerCase();
                const saleDate = new Date(sale.sale_date);

                if (saleStatus === "activa") {
                    totalVentas += amount;
                }

                if (
                    !Number.isNaN(saleDate.getTime()) &&
                    saleDate.getMonth() === currentMonth &&
                    saleDate.getFullYear() === currentYear
                ) {
                    ventasMes += amount;
                }
            });

            const totalVentasElement = document.getElementById("kpiTotalVentas");
            const ventasMesElement = document.getElementById("kpiVentasMes");

            if (totalVentasElement) {
                totalVentasElement.textContent = formatMoney(totalVentas);
            }

            if (ventasMesElement) {
                ventasMesElement.textContent = formatMoney(ventasMes);
            }
        }

    } catch (error) {
        console.error("Error cargando KPIs:", error);
    }
}

function formatMoney(value) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(value || 0);
}

loadDashboardKpis();
