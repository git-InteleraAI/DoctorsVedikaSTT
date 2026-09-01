const express = require("express");
const router = express.Router();
const videoController = require("../controllers/videoController");

// GET /api/educational-videos
router.get("/", videoController.getVideos.bind(videoController));

module.exports = router;
