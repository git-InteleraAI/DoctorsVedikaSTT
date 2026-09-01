const express = require("express");
const router = express.Router();
const availabilityController = require("../controllers/availabilityController");
const { protect } = require("../middleware/authMiddleware");

// Slots check endpoint (can be queried with auth or doctorId)
router.get("/slots", (req, res, next) => {
    // Optional auth middleware attachment
    const authHeader = req.headers.authorization;
    if (authHeader) {
        return protect(req, res, () => availabilityController.getAvailableSlots(req, res));
    }
    return availabilityController.getAvailableSlots(req, res);
});

// Protect all management endpoints below
router.use(protect);

router.get("/", (req, res) => availabilityController.getAvailability(req, res));
router.put("/", (req, res) => availabilityController.updateAvailability(req, res));

router.get("/blocked-dates", (req, res) => availabilityController.getBlockedDates(req, res));
router.post("/blocked-dates", (req, res) => availabilityController.addBlockedDate(req, res));
router.delete("/blocked-dates/:id", (req, res) => availabilityController.deleteBlockedDate(req, res));

module.exports = router;
