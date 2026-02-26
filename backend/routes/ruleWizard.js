import express from "express";
import { parseRuleSentence } from "../services/llmRuleService.js";

const router = express.Router();

router.post("/wizard-llm", async (req, res) => {
  try {
    const {
      sentence,
      target = "single",
      typeAName = "",
      typeBName = "",
      fieldsA = [],
      fieldsB = [],
    } = req.body ?? {};

    if (!sentence || typeof sentence !== "string") {
      return res.status(400).json({ error: "sentence is required" });
    }

    const safeTarget = target === "pair" ? "pair" : "single";
    const safeFieldsA = Array.isArray(fieldsA) ? fieldsA.map(String) : [];
    const safeFieldsB = Array.isArray(fieldsB) ? fieldsB.map(String) : [];

    const result = await parseRuleSentence({
      sentence,
      target: safeTarget,
      typeAName,
      typeBName,
      fieldsA: safeFieldsA,
      fieldsB: safeFieldsB,
    });

    res.json(result);
  } catch (err) {
    console.error("POST /api/rules/wizard-llm error:", err);
    res.status(500).json({ error: err.message || "LLM parse failed" });
  }
});

export default router;
