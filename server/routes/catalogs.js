const express = require("express");
const router = express.Router();

const controller = require("../controllers/catalogsController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/departments", authenticateToken, controller.getDepartments);
router.get("/roles", authenticateToken, controller.getRoles);

module.exports = router;
