const express = require("express");
const router = express.Router();

const controller = require("../controllers/serviceOrdersController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/", authenticateToken, controller.getServiceOrders);

router.get("/:id", authenticateToken, controller.getServiceOrder);

router.post("/from-ticket/:ticketId", authenticateToken, controller.createServiceOrderFromTicket);

router.post("/", authenticateToken, controller.createServiceOrder);

router.put("/:id", authenticateToken, controller.updateServiceOrder);

router.delete("/:id", authenticateToken, controller.deleteServiceOrder);

module.exports = router;