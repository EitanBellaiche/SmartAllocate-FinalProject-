import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut, apiDelete } from "../api/api";

export default function Rules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Modal
  const [showAdd, setShowAdd] = useState(false);

  // Edit Modal
  const [editModal, setEditModal] = useState({
    open: false,
    rule: null,
  });

  // Form for new rule
  const [form, setForm] = useState({
    name: "",
    description: "",
    target_type: "pair",
    is_hard: false,
    is_active: true,
    weight: 10,
    sort_order: 0,
    conditionText: `{
  "all": [
    { "field": "resource.metadata.capacity", "op": ">=", "value": { "ref": "request.students" } }
  ]
}`,
    actionText: `{
  "effect": "score",
  "delta": 10
}`,
  });

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    try {
      const data = await apiGet("/rules");
      setRules(data);
    } catch (err) {
      console.error("Error loading rules:", err);
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // DELETE RULE
  // -----------------------------
  async function deleteRule(id) {
    if (!confirm("Are you sure you want to delete this rule?")) return;

    try {
      await apiDelete(`/rules/${id}`);
      loadRules();
    } catch (err) {
      console.error("Error deleting rule:", err);
      alert("Delete failed");
    }
  }

  // -----------------------------
  // ADD RULE
  // -----------------------------
  async function saveNewRule() {
    let condition, action;

    try {
      condition = JSON.parse(form.conditionText || "{}");
    } catch (e) {
      alert("Condition JSON is invalid");
      return;
    }

    try {
      action = JSON.parse(form.actionText || "{}");
    } catch (e) {
      alert("Action JSON is invalid");
      return;
    }

    try {
      await apiPost("/rules", {
        name: form.name,
        description: form.description,
        target_type: form.target_type,
        is_hard: form.is_hard,
        is_active: form.is_active,
        weight: Number(form.weight) || 0,
        sort_order: Number(form.sort_order) || 0,
        condition,
        action,
      });

      setShowAdd(false);
      setForm({
        name: "",
        description: "",
        target_type: "pair",
        is_hard: false,
        is_active: true,
        weight: 10,
        sort_order: 0,
        conditionText: `{
  "all": [
    { "field": "resource.metadata.capacity", "op": ">=", "value": { "ref": "request.students" } }
  ]
}`,
        actionText: `{
  "effect": "score",
  "delta": 10
}`,
      });
      loadRules();
    } catch (err) {
      console.error("Error creating rule:", err);
      alert("Failed to create rule");
    }
  }

  // -----------------------------
  // EDIT RULE
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
    } catch (e) {
      alert("Condition JSON is invalid");
      return;
    }

    try {
      action = JSON.parse(r.actionText || "{}");
    } catch (e) {
      alert("Action JSON is invalid");
      return;
    }

    try {
      await apiPut(`/rules/${r.id}`, {
        name: r.name,
        description: r.description,
        target_type: r.target_type,
        is_hard: r.is_hard,
        is_active: r.is_active,
        weight: Number(r.weight) || 0,
        sort_order: Number(r.sort_order) || 0,
        condition,
        action,
      });

      setEditModal({ open: false, rule: null });
      loadRules();
    } catch (err) {
      console.error("Error updating rule:", err);
      alert("Update failed");
    }
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
          onClick={() => setShowAdd(true)}
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
                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">
                      HARD
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-green-100 text-green-700">
                      SOFT
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {rule.is_active ? (
                    <span className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs rounded bg-gray-200 text-gray-700">
                      Disabled
                    </span>
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
      {/* ADD RULE MODAL */}
      {/* ------------------------------------------------ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[800px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Add Rule</h2>

            <div className="space-y-4">
              {/* BASIC INFO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Target Type
                  </label>
                  <select
                    value={form.target_type}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, target_type: e.target.value }))
                    }
                    className="w-full p-2 border rounded"
                  >
                    <option value="resource">resource</option>
                    <option value="booking">booking</option>
                    <option value="pair">pair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  className="w-full p-2 border rounded"
                />
              </div>

              <div className="grid grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Weight
                  </label>
                  <input
                    type="number"
                    value={form.weight}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, weight: e.target.value }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, sort_order: e.target.value }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_hard}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_hard: e.target.checked }))
                    }
                  />
                  <span>Hard rule (forbid)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, is_active: e.target.checked }))
                    }
                  />
                  <span>Active</span>
                </label>
              </div>

              {/* CONDITION */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Condition (JSON)
                </label>
                <textarea
                  rows={8}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={form.conditionText}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, conditionText: e.target.value }))
                  }
                />
              </div>

              {/* ACTION */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Action (JSON)
                </label>
                <textarea
                  rows={6}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={form.actionText}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, actionText: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 border rounded"
              >
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
      {/* EDIT RULE MODAL */}
      {/* ------------------------------------------------ */}
      {editModal.open && editModal.rule && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-6 rounded-lg w-[800px] shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Edit Rule – {editModal.rule.name}
            </h2>

            <div className="space-y-4">
              {/* BASIC INFO */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={editModal.rule.name}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, name: e.target.value },
                      }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Target Type
                  </label>
                  <select
                    value={editModal.rule.target_type}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, target_type: e.target.value },
                      }))
                    }
                    className="w-full p-2 border rounded"
                  >
                    <option value="resource">resource</option>
                    <option value="booking">booking</option>
                    <option value="pair">pair</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={editModal.rule.description || ""}
                  onChange={(e) =>
                    setEditModal((p) => ({
                      ...p,
                      rule: { ...p.rule, description: e.target.value },
                    }))
                  }
                  className="w-full p-2 border rounded"
                />
              </div>

              <div className="grid grid-cols-4 gap-4 items-center">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Weight
                  </label>
                  <input
                    type="number"
                    value={editModal.rule.weight}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, weight: e.target.value },
                      }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={editModal.rule.sort_order}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, sort_order: e.target.value },
                      }))
                    }
                    className="w-full p-2 border rounded"
                  />
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editModal.rule.is_hard}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, is_hard: e.target.checked },
                      }))
                    }
                  />
                  <span>Hard rule (forbid)</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editModal.rule.is_active}
                    onChange={(e) =>
                      setEditModal((p) => ({
                        ...p,
                        rule: { ...p.rule, is_active: e.target.checked },
                      }))
                    }
                  />
                  <span>Active</span>
                </label>
              </div>

              {/* CONDITION */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Condition (JSON)
                </label>
                <textarea
                  rows={8}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={editModal.rule.conditionText}
                  onChange={(e) =>
                    setEditModal((p) => ({
                      ...p,
                      rule: { ...p.rule, conditionText: e.target.value },
                    }))
                  }
                />
              </div>

              {/* ACTION */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Action (JSON)
                </label>
                <textarea
                  rows={6}
                  className="w-full p-2 border rounded font-mono text-sm"
                  value={editModal.rule.actionText}
                  onChange={(e) =>
                    setEditModal((p) => ({
                      ...p,
                      rule: { ...p.rule, actionText: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() =>
                  setEditModal({ open: false, rule: null })
                }
                className="px-4 py-2 border rounded"
              >
                Cancel
              </button>

              <button
                onClick={saveEditRule}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
