import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

const OP_OPTIONS = [
  { label: "==", value: "==" },
  { label: "!=", value: "!=" },
  { label: ">=", value: ">=" },
  { label: "<=", value: "<=" },
  { label: ">", value: ">" },
  { label: "<", value: "<" },
];

function uniq(arr) {
  return Array.from(new Set(arr));
}

function toNumberIfPossible(v) {
  if (typeof v !== "string") return v;
  const trimmed = v.trim();
  if (!trimmed) return v;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : v;
}

function getResourceFieldOptions(resource) {
  if (!resource) return [];
  const metaKeys = Object.keys(resource.metadata || {}).sort();
  const base = [
    { label: "id", value: "id" },
    { label: "name", value: "name" },
    { label: "type_id", value: "type_id" },
    { label: "type_name", value: "type_name" },
  ];
  const meta = metaKeys.map((k) => ({ label: `metadata.${k}`, value: `metadata.${k}` }));
  return [...base, ...meta];
}

function fieldLabel(value) {
  if (!value) return "";
  return String(value).replace(/^metadata\./, "");
}

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState("single"); // single | pair
  const [form, setForm] = useState({
    name: "",
    description: "",
    aMode: "resource", // resource | type
    resourceAId: "",
    typeAId: "",
    fieldA: "",
    op: "<",
    constValue: "",
    effect: "forbid", // forbid | alert | score
    scoreDelta: 10,
    is_active: true,
    comparisons: [
      { bMode: "resource", resourceBId: "", typeBId: "", fieldA: "", op: "<", fieldB: "" },
    ],
  });

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

  const resourceOptions = useMemo(
    () => resources.slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [resources]
  );

  const resourceNameById = useMemo(() => {
    const map = new Map();
    for (const r of resources) map.set(String(r.id), r.name);
    return map;
  }, [resources]);

  const typeOptions = useMemo(() => {
    const pairs = resources
      .map((r) => ({ type_id: r.type_id, type_name: r.type_name }))
      .filter((x) => x.type_id && x.type_name);

    const ids = uniq(pairs.map((p) => p.type_id));
    return ids
      .map((id) => pairs.find((p) => p.type_id === id))
      .filter(Boolean)
      .sort((a, b) => Number(a.type_id) - Number(b.type_id));
  }, [resources]);

  const resourceA = useMemo(
    () => resources.find((r) => String(r.id) === String(form.resourceAId)) ?? null,
    [resources, form.resourceAId]
  );

  function getTypeFieldOptions(typeId) {
    if (!typeId) return [];
    const list = resources.filter((r) => String(r.type_id) === String(typeId));
    const keys = uniq(list.flatMap((r) => Object.keys(r.metadata || {}))).sort();
    return keys.map((k) => ({ label: `metadata.${k}`, value: `metadata.${k}` }));
  }

  const fieldsA = useMemo(() => {
    if (form.aMode === "type") return getTypeFieldOptions(form.typeAId);
    return getResourceFieldOptions(resourceA);
  }, [form.aMode, form.typeAId, resourceA, resources]);

  function ensureDefaultFieldA(next) {
    const updated = { ...next };
    if (!updated.fieldA && fieldsA[0]) updated.fieldA = fieldsA[0].value;
    if (Array.isArray(updated.comparisons)) {
      updated.comparisons = updated.comparisons.map((c) => ({
        ...c,
        fieldA: c.fieldA || updated.fieldA || "",
      }));
    }
    return updated;
  }

  function updateForm(patch) {
    setForm((prev) => ensureDefaultFieldA({ ...prev, ...patch }));
  }

  function updateComparison(idx, patch) {
    setForm((prev) => {
      const next = { ...prev, comparisons: [...prev.comparisons] };
      next.comparisons[idx] = { ...next.comparisons[idx], ...patch };
      return ensureDefaultFieldA(next);
    });
  }

  function addComparison() {
    setForm((prev) => {
      const next = {
        ...prev,
        comparisons: [
          ...prev.comparisons,
          { bMode: "resource", resourceBId: "", typeBId: "", fieldA: prev.fieldA || "", op: "<", fieldB: "" },
        ],
      };
      return ensureDefaultFieldA(next);
    });
  }

  function removeComparison(idx) {
    setForm((prev) => ({
      ...prev,
      comparisons: prev.comparisons.filter((_, i) => i !== idx),
    }));
  }

  async function createRule() {
    if (!form.name.trim()) return alert("Name is required");
    if (form.aMode === "resource" && !form.resourceAId) return alert("Please choose Resource A.");
    if (form.aMode === "type" && !form.typeAId) return alert("Please choose Resource Type A.");

    let condition;
    let target_type = "resource";

    const aScopeClause =
      form.aMode === "type"
        ? { field: "resource.type_id", op: "==", value: Number(form.typeAId) }
        : { field: "resource.id", op: "==", value: Number(form.resourceAId) };

    if (mode === "single") {
      if (!form.fieldA) return alert("Please choose a field for Resource A.");
      condition = {
        all: [
          aScopeClause,
          {
            field: `resource.${form.fieldA}`,
            op: form.op,
            value: toNumberIfPossible(form.constValue),
          },
        ],
      };
    } else {
      if (!form.comparisons.length) return alert("Add at least one resource to compare.");
      target_type = "pair";
      const clauses = [aScopeClause];

      for (const [idx, comp] of form.comparisons.entries()) {
        if (!comp.fieldA) return alert(`Choose Field A for row ${idx + 1}`);
        if (!comp.fieldB) return alert(`Choose Field B for row ${idx + 1}`);

        if (comp.bMode === "resource") {
          if (!comp.resourceBId) return alert(`Choose Resource B for row ${idx + 1}`);
          const resourceB = resources.find((r) => String(r.id) === String(comp.resourceBId));
          if (!resourceB?.type_id) return alert(`Resource B (row ${idx + 1}) is missing type.`);

          const typeIdB = Number(resourceB.type_id);
          clauses.push({
            field: `resources_by_type_id.${typeIdB}.id`,
            op: "==",
            value: Number(comp.resourceBId),
          });
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
          });
        } else {
          if (!comp.typeBId) return alert(`Choose Resource Type for row ${idx + 1}`);
          const typeIdB = Number(comp.typeBId);
          clauses.push({
            field: `resource.${comp.fieldA}`,
            op: comp.op,
            value: { ref: `resources_by_type_id.${typeIdB}.${comp.fieldB}` },
          });
        }
      }

      condition = { all: clauses };
    }

    let action;
    if (form.effect === "alert") action = { effect: "alert" };
    else if (form.effect === "score") action = { effect: "score", delta: Number(form.scoreDelta) || 0 };
    else action = { effect: "forbid" };

    const payload = {
      name: form.name.trim(),
      description: form.description ?? "",
      target_type,
      is_hard: form.effect === "forbid",
      is_active: !!form.is_active,
      weight: 0,
      sort_order: 0,
      condition,
      action,
    };

    try {
      await apiPost("/rules", payload);
      reloadRules();
      alert("Rule created.");
    } catch (err) {
      console.error("Error creating rule:", err);
      alert("Failed to create rule");
    }
  }

  async function deleteRule(id) {
    if (!confirm("Delete this rule?")) return;
    try {
      await apiDelete(`/rules/${id}`);
      reloadRules();
    } catch (err) {
      console.error("Error deleting rule:", err);
      alert("Delete failed");
    }
  }

  async function toggleActive(rule) {
    try {
      await apiPut(`/rules/${rule.id}`, {
        ...rule,
        is_active: !rule.is_active,
      });
      reloadRules();
    } catch (err) {
      console.error("Error updating rule:", err);
      alert("Update failed");
    }
  }

  if (loading) return <p className="text-gray-500">Loading rules...</p>;

  const previewText = (() => {
    const aName =
      form.aMode === "type"
        ? typeOptions.find((t) => String(t.type_id) === String(form.typeAId))?.type_name || "Type A"
        : resourceNameById.get(String(form.resourceAId)) || "Resource A";
    const action =
      form.effect === "forbid"
        ? "Block"
        : form.effect === "alert"
        ? "Alert"
        : `Score ${Number(form.scoreDelta) || 0}`;

    if (mode === "single") {
      if (!form.fieldA || !form.op || form.constValue === "") {
        return `If ${aName} matches the condition → ${action}.`;
      }
      return `If ${aName}.${fieldLabel(form.fieldA)} ${form.op} ${form.constValue} → ${action}.`;
    }

    if (!form.comparisons.length) {
      return `If ${aName} is compared to other resources → ${action}.`;
    }
    const parts = form.comparisons.map((c) => {
      const left = fieldLabel(c.fieldA || form.fieldA);
      if (c.bMode === "type") {
        const typeLabel = typeOptions.find((t) => String(t.type_id) === String(c.typeBId))?.type_name || "Type";
        return `${aName}.${left} ${c.op} ${typeLabel}.${fieldLabel(c.fieldB)}`;
      }
      const bName = resourceNameById.get(String(c.resourceBId)) || "Resource B";
      return `${aName}.${left} ${c.op} ${bName}.${fieldLabel(c.fieldB)}`;
    });
    return `If ${parts.join(" AND ")} → ${action}.`;
  })();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Rules</h1>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200 p-5 mb-6">
        <div className="text-lg font-semibold mb-2">Simple Rule Builder</div>
        <div className="text-sm text-gray-500 mb-4">
          Choose one resource (or resource type) and set a condition, or compare it with multiple resources or types.
        </div>

        <div className="flex gap-4 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "single"}
              onChange={() => setMode("single")}
            />
            <span>Rule on a single resource</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={mode === "pair"}
              onChange={() => setMode("pair")}
            />
            <span>Compare with multiple resources</span>
          </label>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">A Source</label>
            <select
              className="w-full p-2 border rounded bg-white"
              value={form.aMode}
              onChange={(e) => updateForm({ aMode: e.target.value, resourceAId: "", typeAId: "", fieldA: "" })}
            >
              <option value="resource">Specific resource</option>
              <option value="type">Resource type</option>
            </select>
            <div className="text-xs text-gray-500 mt-1">Choose if A is a specific resource or any resource of a type.</div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Resource A</label>
            {form.aMode === "type" ? (
              <select
                className="w-full p-2 border rounded bg-white"
                value={form.typeAId}
                onChange={(e) => updateForm({ typeAId: e.target.value, fieldA: "" })}
              >
                <option value="">Choose type…</option>
                {typeOptions.map((t) => (
                  <option key={t.type_id} value={t.type_id}>
                    {t.type_name} (id={t.type_id})
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full p-2 border rounded bg-white"
                value={form.resourceAId}
                onChange={(e) => updateForm({ resourceAId: e.target.value, fieldA: "" })}
              >
                <option value="">Choose resource…</option>
                {resourceOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (id={r.id})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Field (A)</label>
            <select
              className="w-full p-2 border rounded bg-white"
              value={form.fieldA}
              onChange={(e) => updateForm({ fieldA: e.target.value })}
              disabled={form.aMode === "type" ? !form.typeAId : !form.resourceAId}
            >
              <option value="">Choose field…</option>
              {fieldsA.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {mode === "single" ? (
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">Operator</label>
              <select
                className="w-full p-2 border rounded bg-white"
                value={form.op}
                onChange={(e) => updateForm({ op: e.target.value })}
              >
                {OP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Value</label>
              <input
                type="text"
                className="w-full p-2 border rounded"
                value={form.constValue}
                onChange={(e) => updateForm({ constValue: e.target.value })}
              />
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <div className="text-sm font-medium mb-2">Comparisons (A vs multiple B)</div>
            <div className="space-y-3">
              {form.comparisons.map((comp, idx) => {
                const resourceB = resources.find((r) => String(r.id) === String(comp.resourceBId)) ?? null;
                const fieldsB = comp.bMode === "type"
                  ? getTypeFieldOptions(comp.typeBId)
                  : getResourceFieldOptions(resourceB);
                return (
                  <div key={`comp-${idx}`} className="grid grid-cols-6 gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium mb-1">B Source</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.bMode}
                        onChange={(e) => updateComparison(idx, { bMode: e.target.value, resourceBId: "", typeBId: "", fieldB: "" })}
                      >
                        <option value="resource">Specific resource</option>
                        <option value="type">Resource type</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Resource B</label>
                      {comp.bMode === "type" ? (
                        <select
                          className="w-full p-2 border rounded bg-white"
                          value={comp.typeBId}
                          onChange={(e) => updateComparison(idx, { typeBId: e.target.value, fieldB: "" })}
                        >
                          <option value="">Choose type…</option>
                          {typeOptions.map((t) => (
                            <option key={t.type_id} value={t.type_id}>
                              {t.type_name} (id={t.type_id})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          className="w-full p-2 border rounded bg-white"
                          value={comp.resourceBId}
                          onChange={(e) => updateComparison(idx, { resourceBId: e.target.value, fieldB: "" })}
                        >
                          <option value="">Choose resource…</option>
                          {resourceOptions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} (id={r.id})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Field (A)</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.fieldA}
                        onChange={(e) => updateComparison(idx, { fieldA: e.target.value })}
                        disabled={form.aMode === "type" ? !form.typeAId : !form.resourceAId}
                      >
                        <option value="">Choose field…</option>
                        {fieldsA.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Operator</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.op}
                        onChange={(e) => updateComparison(idx, { op: e.target.value })}
                      >
                        {OP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Field (B)</label>
                      <select
                        className="w-full p-2 border rounded bg-white"
                        value={comp.fieldB}
                        onChange={(e) => updateComparison(idx, { fieldB: e.target.value })}
                        disabled={comp.bMode === "type" ? !comp.typeBId : !comp.resourceBId}
                      >
                        <option value="">Choose field…</option>
                        {fieldsB.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeComparison(idx)}
                        className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
                        disabled={form.comparisons.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={addComparison}
              className="mt-3 px-3 py-2 border rounded hover:bg-gray-50"
            >
              + Add Resource
            </button>
            <div className="text-xs text-gray-500 mt-1">
              Tip: choose "Resource type" to apply the rule to any resource of that type.
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Rule Name</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              className="w-full p-2 border rounded"
              value={form.description}
              onChange={(e) => updateForm({ description: e.target.value })}
            />
          </div>
        </div>

        <div className="flex items-center gap-6 mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateForm({ is_active: e.target.checked })}
            />
            <span className="text-sm">Active</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "forbid"}
              onChange={() => updateForm({ effect: "forbid" })}
            />
            <span className="text-sm">Block</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "alert"}
              onChange={() => updateForm({ effect: "alert" })}
            />
            <span className="text-sm">Alert</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.effect === "score"}
              onChange={() => updateForm({ effect: "score" })}
            />
            <span className="text-sm">Score</span>
          </label>

          {form.effect === "score" && (
            <input
              type="number"
              className="w-24 p-2 border rounded"
              value={form.scoreDelta}
              onChange={(e) => updateForm({ scoreDelta: e.target.value })}
            />
          )}
        </div>

        <button
          onClick={createRule}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create Rule
        </button>

        <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3">
          Preview: {previewText}
        </div>

        {mode === "pair" && (
          <div className="text-xs text-gray-500 mt-2">
            Note: when using "Resource type", the comparison uses the first matching resource of that type
            in the booking.
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3">ID</th>
              <th className="p-3">Name</th>
              <th className="p-3">Target</th>
              <th className="p-3">Active</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className="border-t">
                <td className="p-3">{rule.id}</td>
                <td className="p-3 font-medium">{rule.name}</td>
                <td className="p-3">{rule.target_type}</td>
                <td className="p-3">{rule.is_active ? "Active" : "Disabled"}</td>
                <td className="p-3 flex gap-2">
                  <button
                    onClick={() => toggleActive(rule)}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                  >
                    {rule.is_active ? "Disable" : "Enable"}
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
                <td className="p-4 text-center text-gray-500" colSpan={5}>
                  No rules defined yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
