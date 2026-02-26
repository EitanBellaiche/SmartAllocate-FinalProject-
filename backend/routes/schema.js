import express from "express";
import { getResourceTypeSchema } from "../services/schemaService.js";

const router = express.Router();

function getOrgId(req) {
  const value =
    req.query?.org_id ||
    req.query?.organization_id ||
    req.body?.org_id ||
    req.body?.organization_id;
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

router.get("/resource-types", async (req, res) => {
  try {
    const orgId = getOrgId(req);
    const data = await getResourceTypeSchema({ orgId });
    res.json(data);
  } catch (err) {
    console.error("GET /api/schema/resource-types error:", err);
    res.status(500).json({ error: "Failed to fetch resource type schema" });
  }
});

export default router;
