const express = require("express");
const router = express.Router();

const controller = require("../controllers/salePaymentsController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/:saleId", authenticateToken, controller.getPaymentsBySale);

router.post("/", authenticateToken, controller.createPayment);

router.delete("/:id", authenticateToken, controller.deletePayment);

module.exports = router;