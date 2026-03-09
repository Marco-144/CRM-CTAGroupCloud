const express = require("express");
const router = express.Router();

const controller = require("../controllers/prospectsController");
const { authenticateToken } = require("../middlewares/authMiddleware");

// Obtener todos los prospectos
router.get("/", authenticateToken, controller.getProspects);

// Obtener un prospecto por ID
router.get("/:id", authenticateToken, controller.getProspect);

// Crear prospecto
router.post("/", authenticateToken, controller.createProspect);

// Actualizar prospecto
router.put("/:id", authenticateToken, controller.updateProspect);

// Eliminar prospecto
router.delete("/:id", authenticateToken, controller.deleteProspect);

module.exports = router;