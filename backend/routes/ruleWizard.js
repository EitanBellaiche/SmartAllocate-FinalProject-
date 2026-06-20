import express from "express";
import { parseRuleSentence } from "../services/llmRuleService.js";
import { normalizeRuleResources, normalizeWizardTarget } from "../services/ruleResourceHelpers.js";

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
      resources = [],
    } = req.body ?? {};

    if (!sentence || typeof sentence !== "string") {
      return res.status(400).json({ error: "sentence is required" });
    }

    const normalizedResources = normalizeRuleResources({
      resources,
      typeAName,
      typeBName,
      fieldsA,
      fieldsB,
    });
    const safeTarget = normalizeWizardTarget(target, normalizedResources);

    const result = await parseRuleSentence({
      sentence,
      target: safeTarget,
      resources: normalizedResources,
    });

    res.json(result);
  } catch (err) {
    console.error("POST /api/rules/wizard-llm error:", err);
    res.status(500).json({ error: err.message || "LLM parse failed" });
  }
});

export default router;
