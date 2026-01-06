import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

const OP_OPTIONS = [
  { label: "==", value: "==" },
  { label: "!=", value: "!=" },
  { label: ">=", value: ">=" },
  { label: "<=", value: "<=" },
  { label: ">", value: ">" },
  { label: "<", value: "<" },
  { label: "contains", value: "contains" },
  { label: "in", value: "in" },
  { label: "overlap", value: "overlap" },
];

const REQUEST_REF_OPTIONS = [
  { label: "booking.date", value: "booking.date" },
  { label: "booking.start_time", value: "booking.start_time" },
  { label: "booking.end_time", value: "booking.end_time" },
  { label: "booking.user_id", value: "booking.user_id" },
  { label: "request.students", value: "request.students" },
  { label: "request.department", value: "request.department" },
  { label: "request.courseName", value: "request.courseName" },
];

function jsonPretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function asNumberIfPossible(v) {
  if (typeof v === "string") {
    const lowered = v.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== "" ? n : v;
}

function buildConditionJson({
  applyMode,
  selectedTypeId,
  selectedResourceId,
  conditions,
  otherConditions,
}) {
  const all = [];

  // Base scope condition (hidden logic)
  if (applyMode === "type" && selectedTypeId) {
    all.push({ field: "resource.type_id", op: "==", value: Number(selectedTypeId) });
  }
  if (applyMode === "resource" && selectedResourceId) {
    all.push({ field: "resource.id", op: "==", value: Number(selectedResourceId) });
  }

  for (const c of conditions) {
    if (!c.field || !c.op) continue;

    let value;
    if (c.valueMode === "ref") value = { ref: c.refValue };
    else value = asNumberIfPossible(c.constValue);

    all.push({ field: c.field, op: c.op, value });
  }

  for (const c of otherConditions || []) {
    if (!c.typeId || !c.field || !c.op) continue;

    let value;
    if (c.valueMode === "ref") value = { ref: c.refValue };
    else value = asNumberIfPossible(c.constValue);

    all.push({
      field: `resources_by_type_id.${c.typeId}.${c.field}`,
      op: c.op,
      value,
    });
  }

  return { all };
}

function buildActionJson({ actionKind, scoreDelta }) {
  // actionKind: "score" | "forbid" | "alert" | "require_approval"
  if (actionKind === "forbid") return { effect: "forbid" };
  if (actionKind === "alert") return { effect: "alert" };
  if (actionKind === "require_approval") return { effect: "require_approval" };
  return { effect: "score", delta: Number(scoreDelta || 0) };
}

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comparison, setComparison] = useState({
    applyTypeId: "",
    leftTypeId: "",
    leftField: "",
    op: "<",
    rightTypeId: "",
    rightField: "",
  });

  // Add Modal
  const [showAdd, setShowAdd] = useState(false);

  // Edit Modal (נשאיר עריכת JSON ידנית כדי לא להסתבך)
  const [editModal, setEditModal] = useState({ open: false, rule: null });

  // Builder form
  const [form, setForm] = useState({
    // basics
    name: "",
    description: "",
    target_type: "pair",
    is_active: true,
    weight: 10,
    sort_order: 0,

    // Step A: rule type -> maps to actionKind
    ruleType: "soft", // soft|hard|recommend|alert
    actionKind: "score", // score|forbid|alert|require_approval
    scoreDelta: 30,

    // Step B: apply scope
    applyMode: "type", // type|resource|all
    selectedTypeId: "",
    selectedResourceId: "",

    // Step C: conditions
    conditions: [
      // { field:"resource.metadata.capacity", op:">=", valueMode:"ref", refValue:"request.students", constValue:"" }
    ],
    otherConditions: [],

    // Advanced JSON (optional)
    useAdvanced: false,
    advancedConditionText: "",
    advancedActionText: "",
  });

  const conditionJson = useMemo(
    () => buildConditionJson(form),
    [
      form.applyMode,
      form.selectedTypeId,
      form.selectedResourceId,
      form.conditions,
      form.otherConditions,
    ]
  );
  const actionJson = useMemo(
    () => buildActionJson(form),
    [form.actionKind, form.scoreDelta]
  );

  // -----------------------------
  // LOAD
  // -----------------------------
  useEffect(() => {
    (async () => {
      try {
        const [rulesData, resourcesData] = await Promise.all([
          apiGet("/rules"),
          apiGet("/resources"),
        ]);
        setRules(Array.isArray(rulesData) ? rulesData : []);
        setResources(Array.isArray(resourcesData) ? resourcesData : []);
      } catch (err) {
        console.error("Load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function reloadRules() {
    const data = await apiGet("/rules");
    setRules(Array.isArray(data) ? data : []);
  }

  // -----------------------------
  // DELETE RULE
  // -----------------------------
  async function deleteRule(id) {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await apiDelete(`/rules/${id}`);
      reloadRules();
    } catch (err) {
      console.error("Error deleting rule:", err);
      alert("Delete failed");
    }
  }

  // -----------------------------
  // ADD RULE (builder -> DB)
  // -----------------------------
  function openAdd() {
    setForm({
      name: "",
      description: "",
      target_type: "pair",
      is_active: true,
      weight: 10,
      sort_order: 0,

      ruleType: "soft",
      actionKind: "score",
      scoreDelta: 30,

      applyMode: "type",
      selectedTypeId: "",
      selectedResourceId: "",

      conditions: [],
      otherConditions: [],

      useAdvanced: false,
      advancedConditionText: "",
      advancedActionText: "",
    });
    setComparison({
      applyTypeId: "",
      leftTypeId: "",
      leftField: "",
      op: "<",
      rightTypeId: "",
      rightField: "",
    });
    setShowAdd(true);
  }

  async function saveNewRule() {
    if (!form.name.trim()) return alert("Name is required");

    // ruleType -> is_hard + actionKind mapping
    let is_hard = false;
    let actionKind = form.actionKind;

    if (form.ruleType === "hard") {
      is_hard = true;
      actionKind = "forbid";
    } else if (form.ruleType === "alert") {
      actionKind = "alert";
    } else {
      // soft/recommend => score (same JSON, delta changes)
      actionKind = "score";
    }

    let condition = conditionJson;
    let action = buildActionJson({ actionKind, scoreDelta: form.scoreDelta });

    if (form.useAdvanced) {
      try {
        condition = JSON.parse(form.advancedConditionText || "{}");
      } catch {
        return alert("Advanced condition JSON is invalid");
      }
      try {
        action = JSON.parse(form.advancedActionText || "{}");
      } catch {
        return alert("Advanced action JSON is invalid");
      }
    }

    const payload = {
      name: form.name.trim(),
      description: form.description ?? "",
      target_type: form.target_type,
      is_hard,
      is_active: !!form.is_active,
      weight: Number(form.weight) || 0,
      sort_order: Number(form.sort_order) || 0,
      condition,
      action,
    };

    try {
      await apiPost("/rules", payload);
      setShowAdd(false);
      reloadRules();
    } catch (err) {
      console.error("Error creating rule:", err);
      alert("Failed to create rule");
    }
  }

  // -----------------------------
  // EDIT RULE (JSON manual)
  // -----------------------------
  function openEditModal(rule) {
    setEditModal({
      open: true,
      rule: {
        ...rule,
        conditionText: JSON.stringify(rule.condition || {}, null, 2),
        actionText: JSON.stringify(rule.action || {}, null, 2),
      },
    });
  }

  async function saveEditRule() {
    const r = editModal.rule;
    let condition, action;

    try {
      condition = JSON.parse(r.conditionText || "{}");
    } catch {
      return alert("Condition JSON is invalid");
    }
    try {
      action = JSON.parse(r.actionText || "{}");
    } catch {
      return alert("Action JSON is invalid");
    }

    try {
      await apiPut(`/rules/${r.id}`, {
        name: r.name,
        description: r.description ?? "",
        target_type: r.target_type,
        is_hard: !!r.is_hard,
        is_active: !!r.is_active,
        weight: Number(r.weight) || 0,
        sort_order: Number(r.sort_order) || 0,
        condition,
        action,
      });

      setEditModal({ open: false, rule: null });
      reloadRules();
    } catch (err) {
      console.error("Error updating rule:", err);
      alert("Update failed");
    }
  }

  // -----------------------------
  // RESOURCES -> TYPES + FIELDS
  // -----------------------------
  const typeOptions = useMemo(() => {
    // from resources list: type_id + type_name
    const pairs = resources
      .map((r) => ({ type_id: r.type_id, type_name: r.type_name }))
      .filter((x) => x.type_id && x.type_name);

    const ids = uniq(pairs.map((p) => p.type_id));
    return ids
      .map((id) => pairs.find((p) => p.type_id === id))
      .filter(Boolean)
      .sort((a, b) => Number(a.type_id) - Number(b.type_id));
  }, [resources]);

  const resourcesFiltered = useMemo(() => {
    if (form.applyMode === "resource" || form.applyMode === "type") {
      if (!form.selectedTypeId) return [];
      return resources
        .filter((r) => String(r.type_id) === String(form.selectedTypeId))
        .sort((a, b) => Number(a.id) - Number(b.id));
    }
    return resources.slice().sort((a, b) => Number(a.id) - Number(b.id));
  }, [resources, form.applyMode, form.selectedTypeId]);

  const selectedResource = useMemo(() => {
    if (!form.selectedResourceId) return null;
    return resources.find((r) => String(r.id) === String(form.selectedResourceId)) ?? null;
  }, [resources, form.selectedResourceId]);

  const fieldOptions = useMemo(() => {
    // base fields always exist
    const base = [
      { label: "Resource ID", value: "resource.id" },
      { label: "Resource Name", value: "resource.name" },
      { label: "Resource Type ID", value: "resource.type_id" },
      { label: "Resource Type Name", value: "resource.type_name" },
      { label: "Resource Active", value: "resource.active" },
      { label: "Booking Date", value: "booking.date" },
      { label: "Booking Start Time", value: "booking.start_time" },
      { label: "Booking End Time", value: "booking.end_time" },
      { label: "Booking User ID", value: "booking.user_id" },
      { label: "Pair Role", value: "pair.role" },
    ];

    // metadata keys:
    let keys = [];

    if (form.applyMode === "resource" && selectedResource?.metadata) {
      keys = Object.keys(selectedResource.metadata || {});
    } else if ((form.applyMode === "type") && form.selectedTypeId) {
      // union metadata keys across all resources of that type
      const list = resources.filter((r) => String(r.type_id) === String(form.selectedTypeId));
      const allKeys = [];
      for (const r of list) allKeys.push(...Object.keys(r.metadata || {}));
      keys = uniq(allKeys);
    } else if (form.applyMode === "all") {
      const allKeys = [];
      for (const r of resources) allKeys.push(...Object.keys(r.metadata || {}));
      keys = uniq(allKeys);
    }

    const meta = keys.sort().map((k) => ({
      label: `metadata.${k}`,
      value: `resource.metadata.${k}`,
    }));

    return [...base, ...meta];
  }, [resources, form.applyMode, form.selectedTypeId, selectedResource]);

  const getTypeFieldOptions = (typeId) => {
    if (!typeId) return [];
    const list = resources.filter((r) => String(r.type_id) === String(typeId));
    const keys = uniq(list.flatMap((r) => Object.keys(r.metadata || {}))).sort();

    const base = [
      { label: "id", value: "id" },
      { label: "name", value: "name" },
      { label: "type_id", value: "type_id" },
    ];

    const meta = keys.map((k) => ({
      label: `metadata.${k}`,
      value: `metadata.${k}`,
    }));

    return [...base, ...meta];
  };

  function addCondition() {
    const firstField = fieldOptions[0]?.value ?? "resource.id";
    setForm((p) => ({
      ...p,
      conditions: [
        ...p.conditions,
        {
          field: firstField,
          op: "==",
          valueMode: "const",
          constValue: "",
          refValue: "request.students",
        },
      ],
    }));
  }

  function updateCondition(idx, patch) {
    setForm((p) => {
      const next = [...p.conditions];
      next[idx] = { ...next[idx], ...patch };
      return { ...p, conditions: next };
    });
  }

  function removeCondition(idx) {
    setForm((p) => ({ ...p, conditions: p.conditions.filter((_, i) => i !== idx) }));
  }

  function addOtherCondition() {
    setForm((p) => ({
      ...p,
      otherConditions: [
        ...p.otherConditions,
        {
          typeId: "",
          field: "",
          op: "==",
          valueMode: "const",
          constValue: "",
          refValue: "request.students",
        },
      ],
    }));
  }

  function updateOtherCondition(idx, patch) {
    setForm((p) => {
      const next = [...p.otherConditions];
      next[idx] = { ...next[idx], ...patch };
      return { ...p, otherConditions: next };
    });
  }

  function removeOtherCondition(idx) {
    setForm((p) => ({
      ...p,
      otherConditions: p.otherConditions.filter((_, i) => i !== idx),
    }));
  }

  // human summary
  const humanSummary = useMemo(() => {
    const parts = [];
    if (form.applyMode === "resource" && selectedResource) {
      parts.push(`If resource is "${selectedResource.name}" (${selectedResource.type_name})`);
    } else if (form.applyMode === "type" && form.selectedTypeId) {
      const t = typeOptions.find((x) => String(x.type_id) === String(form.selectedTypeId));
      parts.push(`If resource type is "${t?.type_name ?? form.selectedTypeId}"`);
    } else {
      parts.push("If resource matches conditions");
    }

    if (form.conditions.length || form.otherConditions.length) {
      parts.push("and conditions match");
    }

    let then = "";
    if (form.ruleType === "hard") then = "→ forbid";
    else if (form.ruleType === "alert") then = "→ alert only";
    else then = `→ add score +${form.scoreDelta}`;

    return `${parts.join(" ")} ${then}`;
  }, [
    form.applyMode,
    form.selectedTypeId,
    form.conditions.length,
    form.otherConditions.length,
    form.ruleType,
    form.scoreDelta,
    selectedResource,
    typeOptions,
  ]);

  function applyTemplate(templateKey) {
    if (templateKey === "block-resource") {
      setForm((p) => ({
        ...p,
        name: "Block specific resource",
        description: "Hard rule that blocks a specific resource",
        ruleType: "hard",
        target_type: "pair",
        applyMode: "resource",
        selectedTypeId: "",
        selectedResourceId: "",
        conditions: [],
        otherConditions: [],
        useAdvanced: false,
        advancedConditionText: "",
        advancedActionText: "",
      }));
      return;
    }

    if (templateKey === "prefer-resource") {
      setForm((p) => ({
        ...p,
        name: "Prefer specific resource",
        description: "Soft rule that adds score to a resource",
        ruleType: "soft",
        target_type: "pair",
        scoreDelta: 30,
        applyMode: "resource",
        selectedTypeId: "",
        selectedResourceId: "",
        conditions: [],
        otherConditions: [],
        useAdvanced: false,
        advancedConditionText: "",
        advancedActionText: "",
      }));
      return;
    }

    if (templateKey === "course-capacity") return;
  }

  function buildComparisonCondition() {
    if (!comparison.leftTypeId || !comparison.leftField || !comparison.rightTypeId || !comparison.rightField) {
      return null;
    }

    const all = [];
    if (comparison.applyTypeId) {
      all.push({
        field: "resource.type_id",
        op: "==",
        value: Number(comparison.applyTypeId),
      });
    }

    all.push({
      field: `resources_by_type_id.${comparison.leftTypeId}.${comparison.leftField}`,
      op: comparison.op,
      value: {
        ref: `resources_by_type_id.${comparison.rightTypeId}.${comparison.rightField}`,
      },
    });

    return { all };
  }

  function applyComparisonRule() {
    const condition = buildComparisonCondition();
    if (!condition) return alert("Please select both types and fields.");

    const actionKind =
      form.ruleType === "hard"
        ? "forbid"
        : form.ruleType === "alert"
        ? "alert"
        : "score";
    const action = buildActionJson({ actionKind, scoreDelta: form.scoreDelta });

    setForm((p) => ({
      ...p,
      name: p.name || "Compare fields between two resource types",
      description: p.description || "Generic comparison rule between two resource types",
      target_type: "pair",
      applyMode: "all",
      selectedTypeId: "",
      selectedResourceId: "",
      conditions: [],
      useAdvanced: true,
      advancedConditionText: JSON.stringify(condition, null, 2),
      advancedActionText: JSON.stringify(action, null, 2),
    }));
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  if (loading) return <p className="text-gray-500">Loading rules...</p>;

  return (
    <div>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Rules</h1>

        <button
          onClick={openAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          + Add Rule
        </button>
      </div>

      {/* TABLE */}
      <div className="bg-white shadow rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Target</th>
              <th className="p-3">Hard?</th>
              <th className="p-3">Active?</th>
              <th className="p-3">Weight</th>
              <th className="p-3">Order</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t">
                <td className="p-3">{rule.id}</td>
                <td className="p-3 font-medium">{rule.name}</td>
                <td className="p-3">{rule.target_type}</td>
                <td className="p-3">
                  {rule.is_hard ? (
                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">HARD</span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">SOFT</span>
                  )}
                </td>
                <td className="p-3">
                  {rule.is_active ? (
                    <span className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">Active</span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">Disabled</span>
                  )}
                </td>
                <td className="p-3">{rule.weight}</td>
                <td className="p-3">{rule.sort_order}</td>

                <td className="p-3 flex gap-2">
                  <button
                    onClick={() => openEditModal(rule)}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {rules.length === 0 && (
              <tr>
                <td className="p-4 text-center text-gray-500" colSpan={8}>
                  No rules defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------ */}
      {/* ADD RULE MODAL (BUILDER) */}
      {/* ------------------------------------------------ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[920px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add Rule</h2>

            {/* Quick Templates */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-2">Quick Templates</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => applyTemplate("block-resource")}
                  className="px-3 py-2 border rounded hover:bg-gray-50"
                >
                  Block Resource
                </button>
                <button
                  onClick={() => applyTemplate("prefer-resource")}
                  className="px-3 py-2 border rounded hover:bg-gray-50"
                >
                  Prefer Resource
                </button>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Use templates to auto-fill the form. You can still edit any field.
              </div>
            </div>

            {/* Generic Comparison Rule */}
            <div className="mb-6 border rounded-lg p-4 bg-gray-50">
              <div className="text-sm font-semibold mb-2">Generic Comparison Rule</div>
              <div className="text-xs text-gray-500 mb-3">
                Compare a numeric field from Resource Type A to Resource Type B in the same booking.
                Example: Course.students &gt; Classroom.capacity.
              </div>
              <div className="text-xs text-gray-500 mb-3">
                This rule uses the selected types and fields, not hardcoded names.
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Apply when resource is</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.applyTypeId}
                    onChange={(e) => setComparison((p) => ({ ...p, applyTypeId: e.target.value }))}
                  >
                    <option value="">Any type</option>
                    {typeOptions.map((t) => (
                      <option key={t.type_id} value={t.type_id}>
                        {t.type_name} (id={t.type_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Left Type</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.leftTypeId}
                    onChange={(e) =>
                      setComparison((p) => ({
                        ...p,
                        leftTypeId: e.target.value,
                        leftField: "",
                      }))
                    }
                  >
                    <option value="">Choose type…</option>
                    {typeOptions.map((t) => (
                      <option key={t.type_id} value={t.type_id}>
                        {t.type_name} (id={t.type_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Left Field</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.leftField}
                    onChange={(e) => setComparison((p) => ({ ...p, leftField: e.target.value }))}
                    disabled={!comparison.leftTypeId}
                  >
                    <option value="">Choose field…</option>
                    {getTypeFieldOptions(comparison.leftTypeId).map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Operator</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.op}
                    onChange={(e) => setComparison((p) => ({ ...p, op: e.target.value }))}
                  >
                    {OP_OPTIONS.filter((o) => ["<", "<=", ">", ">=", "==", "!="].includes(o.value)).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Right Type</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.rightTypeId}
                    onChange={(e) =>
                      setComparison((p) => ({
                        ...p,
                        rightTypeId: e.target.value,
                        rightField: "",
                      }))
                    }
                  >
                    <option value="">Choose type…</option>
                    {typeOptions.map((t) => (
                      <option key={t.type_id} value={t.type_id}>
                        {t.type_name} (id={t.type_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Right Field</label>
                  <select
                    className="w-full p-2 border rounded bg-white"
                    value={comparison.rightField}
                    onChange={(e) => setComparison((p) => ({ ...p, rightField: e.target.value }))}
                    disabled={!comparison.rightTypeId}
                  >
                    <option value="">Choose field…</option>
                    {getTypeFieldOptions(comparison.rightTypeId).map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={applyComparisonRule}
                  className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Use This Comparison Rule
                </button>
                <div className="text-xs text-gray-500">
                  This fills Advanced JSON for you.
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Pair rules use the resources selected together in a booking.
              </div>
            </div>

            {/* Step A: Rule type */}
            <div className="mb-6">
              <div className="text-sm font-semibold mb-2">Step A — Rule Type</div>
              <div className="text-xs text-gray-500 mb-3">
                Hard = block. Soft = add score. Choose how the system reacts.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.ruleType === "soft"}
                    onChange={() => setForm((p) => ({ ...p, ruleType: "soft" }))}
                  />
                  <div>
                    <div className="font-medium">Soft rule (Priority / Score)</div>
                    <div className="text-xs text-gray-500">Adds score to matching resources</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.ruleType === "hard"}
                    onChange={() => setForm((p) => ({ ...p, ruleType: "hard" }))}
                  />
                  <div>
                    <div className="font-medium">Hard rule (Block)</div>
                    <div className="text-xs text-gray-500">Forbids matching resources</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.ruleType === "recommend"}
                    onChange={() => setForm((p) => ({ ...p, ruleType: "recommend" }))}
                  />
                  <div>
                    <div className="font-medium">Recommendation / Score</div>
                    <div className="text-xs text-gray-500">Same as soft, usually lower delta</div>
                  </div>
                </label>

                <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                  <input
                    type="radio"
                    checked={form.ruleType === "alert"}
                    onChange={() => setForm((p) => ({ ...p, ruleType: "alert" }))}
                  />
                  <div>
                    <div className="font-medium">Alert only</div>
                    <div className="text-xs text-gray-500">Stores action as alert (engine can decide)</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Basic info */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Type</label>
                  <select
                    value={form.target_type}
                    onChange={(e) => setForm((p) => ({ ...p, target_type: e.target.value }))}
                    className="w-full p-2 border rounded"
                  >
                    <option value="resource">resource</option>
                    <option value="booking">booking</option>
                    <option value="pair">pair</option>
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    Pair checks each resource in a booking and can compare with other resources.
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  className="w-full p-2 border rounded"
                />
              </div>

              <div className="grid grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-sm font-medium mb-1">Weight</label>
                  <input
                    type="number"
                    value={form.weight}
                    onChange={(e) => setForm((p) => ({ ...p, weight: e.target.value }))}
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((p) => ({ ...p, sort_order: e.target.value }))}
                    className="w-full p-2 border rounded"
                  />
                </div>

                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                  />
                  <span>Active</span>
                </label>

                <div className="mt-6 text-xs text-gray-500">
                  Hard/Soft is derived from “Rule Type”
                </div>
              </div>

              {/* Step B: Scope */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Step B — Applies to (Scope)</div>
                <div className="text-xs text-gray-500 mb-3">
                  Use this to limit the rule to a specific type or a single resource.
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.applyMode === "all"}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          applyMode: "all",
                          selectedTypeId: "",
                          selectedResourceId: "",
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">All resources</div>
                      <div className="text-xs text-gray-500">No base filter</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.applyMode === "type"}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          applyMode: "type",
                          selectedResourceId: "",
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">Specific type</div>
                      <div className="text-xs text-gray-500">Classroom / Teacher / …</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2 border rounded p-3 cursor-pointer">
                    <input
                      type="radio"
                      checked={form.applyMode === "resource"}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          applyMode: "resource",
                        }))
                      }
                    />
                    <div>
                      <div className="font-medium">Specific resource</div>
                      <div className="text-xs text-gray-500">Room 247 / Dr. Cohen / …</div>
                    </div>
                  </label>
                </div>

                {form.target_type === "pair" && (
                  <div className="text-xs text-gray-500 mt-3">
                    Pair rules apply when multiple resources are selected in the same booking.
                  </div>
                )}

                {(form.applyMode === "type" || form.applyMode === "resource") && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Resource Type</label>
                      <select
                        value={form.selectedTypeId}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            selectedTypeId: e.target.value,
                            selectedResourceId: "",
                            conditions: p.conditions.map((c) => ({
                              ...c,
                              field: fieldOptions[0]?.value ?? c.field,
                            })),
                          }))
                        }
                        className="w-full p-2 border rounded"
                      >
                        <option value="">Choose type…</option>
                        {typeOptions.map((t) => (
                          <option key={t.type_id} value={t.type_id}>
                            {t.type_name} (id={t.type_id})
                          </option>
                        ))}
                      </select>
                    </div>

                    {form.applyMode === "resource" && (
                      <div>
                        <label className="block text-sm font-medium mb-1">Resource</label>
                        <select
                          value={form.selectedResourceId}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              selectedResourceId: e.target.value,
                              conditions: p.conditions.map((c) => ({
                                ...c,
                                field: fieldOptions[0]?.value ?? c.field,
                              })),
                            }))
                          }
                          className="w-full p-2 border rounded"
                          disabled={!form.selectedTypeId}
                        >
                          <option value="">Choose resource…</option>
                          {resourcesFiltered.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} (id={r.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step C: Conditions */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Step C — Conditions</div>

                <div className="text-xs text-gray-500 mb-3">
                  Conditions are combined with AND. Fields come from the current resource and its metadata.
                  {form.useAdvanced ? " Advanced JSON overrides these conditions." : ""}
                </div>

                {form.conditions.length === 0 && (
                  <div className="p-3 bg-gray-50 border rounded text-sm text-gray-600">
                    No conditions yet. Click “+ Add condition”.
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {form.conditions.map((c, idx) => (
                    <div key={idx} className="border rounded p-3 grid grid-cols-5 gap-3 items-end">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1">Field</label>
                        <select
                          className="w-full p-2 border rounded"
                          value={c.field}
                          onChange={(e) => updateCondition(idx, { field: e.target.value })}
                        >
                          {fieldOptions.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">Op</label>
                        <select
                          className="w-full p-2 border rounded"
                          value={c.op}
                          onChange={(e) => updateCondition(idx, { op: e.target.value })}
                        >
                          {OP_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">Value type</label>
                        <select
                          className="w-full p-2 border rounded"
                          value={c.valueMode}
                          onChange={(e) => updateCondition(idx, { valueMode: e.target.value })}
                        >
                          <option value="const">Constant</option>
                          <option value="ref">From request</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          {c.valueMode === "ref" ? "Request ref" : "Constant"}
                        </label>
                        {c.valueMode === "ref" ? (
                          <select
                            className="w-full p-2 border rounded"
                            value={c.refValue}
                            onChange={(e) => updateCondition(idx, { refValue: e.target.value })}
                          >
                            {REQUEST_REF_OPTIONS.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="w-full p-2 border rounded"
                            value={c.constValue ?? ""}
                            onChange={(e) => updateCondition(idx, { constValue: e.target.value })}
                            placeholder='e.g. 40 / "Computer Science"'
                          />
                        )}
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => removeCondition(idx)}
                          className="px-3 py-2 border rounded text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3">
                  <button
                    onClick={addCondition}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                    disabled={
                      (form.applyMode === "type" || form.applyMode === "resource") &&
                      !form.selectedTypeId
                    }
                    title={
                      (form.applyMode === "type" || form.applyMode === "resource") && !form.selectedTypeId
                        ? "Choose Resource Type first"
                        : ""
                    }
                  >
                    + Add condition
                  </button>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">
                  Other Resource Conditions (same booking)
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  Use this to reference a different resource type in the same booking.
                </div>

                {form.otherConditions.length === 0 && (
                  <div className="p-3 bg-gray-50 border rounded text-sm text-gray-600">
                    No other-resource conditions yet. Click “+ Add”.
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {form.otherConditions.map((c, idx) => {
                    const fields = getTypeFieldOptions(c.typeId);
                    return (
                      <div key={idx} className="border rounded p-3 grid grid-cols-6 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-1">Resource Type</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={c.typeId}
                            onChange={(e) => {
                              const nextTypeId = e.target.value;
                              const nextFields = getTypeFieldOptions(nextTypeId);
                              updateOtherCondition(idx, {
                                typeId: nextTypeId,
                                field: nextFields[0]?.value ?? "",
                              });
                            }}
                          >
                            <option value="">Choose type…</option>
                            {typeOptions.map((t) => (
                              <option key={t.type_id} value={t.type_id}>
                                {t.type_name} (id={t.type_id})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium mb-1">Field</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={c.field}
                            onChange={(e) =>
                              updateOtherCondition(idx, { field: e.target.value })
                            }
                            disabled={!c.typeId}
                          >
                            <option value="">Choose field…</option>
                            {fields.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">Op</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={c.op}
                            onChange={(e) => updateOtherCondition(idx, { op: e.target.value })}
                          >
                            {OP_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">Value type</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={c.valueMode}
                            onChange={(e) =>
                              updateOtherCondition(idx, { valueMode: e.target.value })
                            }
                          >
                            <option value="const">Constant</option>
                            <option value="ref">From request</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">
                            {c.valueMode === "ref" ? "Request ref" : "Constant"}
                          </label>
                          {c.valueMode === "ref" ? (
                            <select
                              className="w-full p-2 border rounded"
                              value={c.refValue}
                              onChange={(e) =>
                                updateOtherCondition(idx, { refValue: e.target.value })
                              }
                            >
                              {REQUEST_REF_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="w-full p-2 border rounded"
                              value={c.constValue ?? ""}
                              onChange={(e) =>
                                updateOtherCondition(idx, { constValue: e.target.value })
                              }
                              placeholder='e.g. "intro to cyber"'
                            />
                          )}
                        </div>

                        <div className="flex justify-end col-span-6">
                          <button
                            onClick={() => removeOtherCondition(idx)}
                            className="px-3 py-2 border rounded text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3">
                  <button
                    onClick={addOtherCondition}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    + Add other-resource condition
                  </button>
                </div>
              </div>

              {/* Advanced JSON */}
              <div className="border-t pt-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={form.useAdvanced}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, useAdvanced: e.target.checked }))
                    }
                  />
                  Use Advanced JSON
                </label>
                <div className="text-xs text-gray-500 mt-1">
                  Use this for complex rules that compare two resources (e.g., Course vs Classroom).
                </div>

                {form.useAdvanced && (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Condition (JSON)</label>
                      <textarea
                        className="w-full p-2 border rounded font-mono text-xs h-40"
                        value={form.advancedConditionText}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, advancedConditionText: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Action (JSON)</label>
                      <textarea
                        className="w-full p-2 border rounded font-mono text-xs h-40"
                        value={form.advancedActionText}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, advancedActionText: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Step D: Action */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Step D — Action</div>

                {form.ruleType === "hard" ? (
                  <div className="p-3 rounded border bg-red-50 text-sm">
                    Hard rule → <b>forbid</b>
                  </div>
                ) : form.ruleType === "alert" ? (
                  <div className="p-3 rounded border bg-yellow-50 text-sm">
                    Alert rule → <b>alert only</b>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium mb-1">Priority delta</label>
                      <input
                        type="number"
                        className="w-full p-2 border rounded"
                        value={form.scoreDelta}
                        onChange={(e) => setForm((p) => ({ ...p, scoreDelta: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="text-xs text-gray-500">
                      Soft/Recommend rule → action = <code>{"{effect:'score', delta}"}</code>
                    </div>
                  </div>
                )}
              </div>

              {/* Step E: Summary + JSON preview */}
              <div className="border-t pt-4">
                <div className="text-sm font-semibold mb-2">Step E — Human Summary</div>
                <div className="p-3 rounded border bg-gray-50 text-sm">
                  🧠 {humanSummary}
                </div>

                {!form.useAdvanced ? (
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div>
                      <div className="text-xs font-semibold mb-1">Condition JSON (auto)</div>
                      <pre className="text-xs bg-slate-900 text-slate-100 rounded p-3 overflow-auto">
                        {jsonPretty(conditionJson)}
                      </pre>
                    </div>
                    <div>
                      <div className="text-xs font-semibold mb-1">Action JSON (auto)</div>
                      <pre className="text-xs bg-slate-900 text-slate-100 rounded p-3 overflow-auto">
                        {jsonPretty(
                          buildActionJson({
                            actionKind:
                              form.ruleType === "hard"
                                ? "forbid"
                                : form.ruleType === "alert"
                                ? "alert"
                                : "score",
                            scoreDelta: form.scoreDelta,
                          })
                        )}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-gray-500">
                    Using Advanced JSON. The preview above is skipped.
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 border rounded">
                Cancel
              </button>

              <button
                onClick={saveNewRule}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* EDIT RULE MODAL (JSON manual) */}
      {/* ------------------------------------------------ */}
      {editModal.open && editModal.rule && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[900px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Edit Rule – {editModal.rule.name}</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    className="w-full p-2 border rounded"
                    value={editModal.rule.name}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, name: e.target.value } }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Target Type</label>
                  <select
                    className="w-full p-2 border rounded"
                    value={editModal.rule.target_type}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, target_type: e.target.value } }))
                    }
                  >
                    <option value="resource">resource</option>
                    <option value="booking">booking</option>
                    <option value="pair">pair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  className="w-full p-2 border rounded"
                  value={editModal.rule.description || ""}
                  onChange={(e) =>
                    setEditModal((p) => ({ ...p, rule: { ...p.rule, description: e.target.value } }))
                  }
                />
              </div>

              <div className="grid grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-sm font-medium mb-1">Weight</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={editModal.rule.weight}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, weight: e.target.value } }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Sort Order</label>
                  <input
                    type="number"
                    className="w-full p-2 border rounded"
                    value={editModal.rule.sort_order}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, sort_order: e.target.value } }))
                    }
                  />
                </div>

                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={!!editModal.rule.is_hard}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, is_hard: e.target.checked } }))
                    }
                  />
                  <span>Hard</span>
                </label>

                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    checked={!!editModal.rule.is_active}
                    onChange={(e) =>
                      setEditModal((p) => ({ ...p, rule: { ...p.rule, is_active: e.target.checked } }))
                    }
                  />
                  <span>Active</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Condition (JSON)</label>
                <textarea
                  rows={8}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={editModal.rule.conditionText}
                  onChange={(e) =>
                    setEditModal((p) => ({ ...p, rule: { ...p.rule, conditionText: e.target.value } }))
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Action (JSON)</label>
                <textarea
                  rows={6}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={editModal.rule.actionText}
                  onChange={(e) =>
                    setEditModal((p) => ({ ...p, rule: { ...p.rule, actionText: e.target.value } }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditModal({ open: false, rule: null })}
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveEditRule}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
