const express = require("express");
const router = express.Router();

const appointmentController = require("../controllers/appointmentController");
const { protect } = require("../middleware/authMiddleware");

// All appointment routes require authentication
router.use(protect);

/*
 * ============================================================
 * DOCTOR DASHBOARD — NEW APPOINTMENT APIs
 * ============================================================
 *
 * These are intentionally placed BEFORE "/:id".
 * Otherwise Express could interpret:
 *   /calendar
 *   /calendar/day
 *   /daily
 * as an appointment ID.
 */

// Today's operational tabs
router.get(
    "/daily",
    (req, res) => appointmentController.getDailyAppointments(req, res)
);

// Calendar month view
router.get(
    "/calendar",
    (req, res) => appointmentController.getCalendarAppointments(req, res)
);

// Selected calendar date
router.get(
    "/calendar/day",
    (req, res) => appointmentController.getCalendarDayAppointments(req, res)
);


/*
 * ============================================================
 * EXISTING APPOINTMENT APIs
 * ============================================================
 */

// Dashboard metrics
router.get(
    "/metrics",
    (req, res) => appointmentController.getDashboardMetrics(req, res)
);

// Book appointment
router.post(
    "/book",
    (req, res) => appointmentController.bookAppointment(req, res)
);

// Existing appointment listing
router.get(
    "/",
    (req, res) => appointmentController.getAppointments(req, res)
);

// Appointment symptoms
router.get(
    "/symptoms/details",
    (req, res) => appointmentController.getAppointmentSymptoms(req, res)
);

// Single appointment
router.get(
    "/:id",
    (req, res) => appointmentController.getAppointmentById(req, res)
);

// Atomic reschedule appointment
router.post(
    "/:id/reschedule",
    (req, res) => appointmentController.rescheduleAppointment(req, res)
);

// Existing status update
router.patch(
    "/:id",
    (req, res) => appointmentController.updateStatus(req, res)
);

module.exports = router;