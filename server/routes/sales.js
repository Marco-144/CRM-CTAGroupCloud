const express = require("express");
const router = express.Router();

const controller = require("../controllers/salesController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/", authenticateToken, controller.getSales);
router.get("/recurring-summary", authenticateToken, controller.getRecurringDashboardSummary);
router.get("/recurring-board", authenticateToken, controller.getRecurringBoard);
router.patch("/recurring-charge/:id", authenticateToken, controller.updateRecurringCharge);

router.get("/:id", authenticateToken, controller.getSale);

router.post("/from-quote/:id", authenticateToken, controller.createFromQuote);

router.patch("/:id/status", authenticateToken, controller.updateSaleStatus);

router.delete("/:id", authenticateToken, controller.deleteSale);

module.exports = router;