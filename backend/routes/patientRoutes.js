const express = require("express");
const router = express.Router();
const patientController = require("../controllers/patientController");
const { protect } = require("../middleware/authMiddleware");

// All patient routes require authentication
router.use(protect);

// Search or list patients
router.get("/", (req, res) => patientController.searchPatients(req, res));
router.get("/search", (req, res) => patientController.searchPatients(req, res));

// Create a walk-in patient
router.post("/walkin", (req, res) => patientController.createWalkInPatient(req, res));

// Get single patient and visit history
router.get("/:patientId/history", (req, res) => patientController.getPatientHistory(req, res));

// Create a walk-in visit for a patient
router.post("/:patientId/visit", (req, res) => patientController.createWalkInVisit(req, res));

module.exports = router;
