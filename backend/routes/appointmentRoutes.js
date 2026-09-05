const express = require("express");
const router = express.Router();
const appointmentController = require("../controllers/appointmentController");
const { protect } = require("../middleware/authMiddleware");

// All appointment routes require authentication
router.use(protect);

// Get dashboard metrics summary
router.get("/metrics", (req, res) => appointmentController.getDashboardMetrics(req, res));

// Book a new confirmed appointment
router.post("/book", (req, res) => appointmentController.bookAppointment(req, res));

// Get appointments with filters (tab, dateFilter)
router.get("/", (req, res) => appointmentController.getAppointments(req, res));

// Get appointment symptoms details from appointment_symptoms table
router.get("/symptoms/details", (req, res) => appointmentController.getAppointmentSymptoms(req, res));

// Get a single appointment by ID
router.get("/:id", (req, res) => appointmentController.getAppointmentById(req, res));

// Update appointment status (e.g. pending, completed)
router.patch("/:id", (req, res) => appointmentController.updateStatus(req, res));

module.exports = router;
