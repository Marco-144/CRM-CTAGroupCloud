const express = require("express");
const router = express.Router();

const controller = require("../controllers/payrollController");
const { authenticateToken } = require("../middlewares/authMiddleware");

router.get("/users", authenticateToken, controller.getPayrollUsers);

router.get("/employees", authenticateToken, controller.getPayrollEmployees);
router.post("/employees", authenticateToken, controller.createPayrollEmployee);
router.put("/employees/:id", authenticateToken, controller.updatePayrollEmployee);
router.delete("/employees/:id", authenticateToken, controller.deletePayrollEmployee);

router.get("/charges", authenticateToken, controller.getPayrollCharges);
router.get("/charges/:chargeId/payments", authenticateToken, controller.getPayrollChargePayments);

router.post("/payments", authenticateToken, controller.createPayrollPayment);
router.delete("/payments/:id", authenticateToken, controller.deletePayrollPayment);

router.get("/dashboard-summary", authenticateToken, controller.getPayrollDashboardSummary);

module.exports = router;
