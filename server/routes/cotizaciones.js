const express = require("express");
const router = express.Router();

const controller = require("../controllers/cotizacionesController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/", authenticateToken, controller.getCotizaciones);

router.get("/:id", authenticateToken, controller.getCotizacion);

router.get("/:id/pdf", authenticateToken, controller.getCotizacionPDF);

router.post("/", authenticateToken, controller.createCotizacion);

router.put("/:id", authenticateToken, controller.updateCotizacion);

router.delete("/:id", authenticateToken, controller.deleteCotizacion);

router.patch("/:id/status", authenticateToken, controller.changeStatus);

router.patch("/:id/complete", authenticateToken, controller.completeCotizacion);

router.delete("/:id/permanent", authenticateToken, controller.deletePermanent);

module.exports = router;