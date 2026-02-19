import { useEffect, useState } from "react";
import { BarChart3, Plus, Trash2, Calculator, Wand2, Info } from "lucide-react";
import { depreciationApi, propertiesApi, type DepreciationPlan, type Property } from "../lib/api";
import { useLmnpStore } from "../store";

interface ComponentConfig {
  label: string;
  default_years: number;
  min_years: number;
  max_years: number;
}

interface Suggestion {
  component: string;
  label: string;
  value: number;
  duration_years: number;
  start_date: string;
  hint: string;
}

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

// Tooltip descriptions per component type
const COMPONENT_HINTS: Record<string, string> = {
  building: "Structure du bâtiment (murs, toiture, charpente). Amortissable sur 30 à 50 ans. Ne pas inclure le terrain.",
  furniture: "Meubles et équipements (lit, canapé, cuisine équipée…). Amortissable sur 5 à 10 ans. Justifiable par factures.",
  electrical: "Installation électrique, tableau, câblage. Amortissable sur 15 à 25 ans.",
  plumbing: "Plomberie, sanitaires, chauffe-eau. Amortissable sur 15 à 25 ans.",
  roof: "Toiture et isolation. Amortissable sur 20 à 30 ans.",
  acquisition_costs: "Frais de notaire, d'agence, droits de mutation. Amortissable sur 5 ans en option (sinon déductible en charge l'année d'acquisition).",
};

export default function Depreciation() {
  const { selectedPropertyId, setSelectedProperty, selectedYear } = useLmnpStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [plans, setPlans] = useState<DepreciationPlan[]>([]);
  const [components, setComponents] = useState<Record<string, ComponentConfig>>({});
  const [showForm, setShowForm] = useState(false);
  const [computing, setComputing] = useState(false);
  const [computeResult, setComputeResult] = useState<{
    total_annual: number;
    total_deductible: number;
    total_carried_over: number;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [addingAll, setAddingAll] = useState(false);

  const [form, setForm] = useState({
    component: "",
    value: "",
    duration_years: "",
    start_date: "",
  });

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;

  const load = () => {
    if (!selectedPropertyId) return;
    depreciationApi.list(selectedPropertyId, selectedYear).then((r) => setPlans(r.data));
  };

  useEffect(() => {
    propertiesApi.list().then((r) => {
      setProperties(r.data);
      if (!selectedPropertyId && r.data.length > 0) setSelectedProperty(r.data[0].id);
    });
    depreciationApi.components(selectedYear).then((r) => setComponents(r.data));
  }, []);

  useEffect(() => { load(); }, [selectedPropertyId, selectedYear]);

  // Auto-fill start_date from property acquisition date when component is selected
  const handleComponentChange = (key: string) => {
    const c = components[key];
    setForm((prev) => ({
      ...prev,
      component: key,
      duration_years: c ? String(c.default_years) : "",
      start_date: prev.start_date || (selectedProperty?.acquisition_date ?? ""),
    }));
  };

  // Build suggestions from selected property values
  const buildSuggestions = () => {
    if (!selectedProperty || !Object.keys(components).length) return;
    const sugs: Suggestion[] = [];
    const acqDate = selectedProperty.acquisition_date;

    if (selectedProperty.building_value > 0 && components["building"]) {
      sugs.push({
        component: "building",
        label: components["building"].label,
        value: selectedProperty.building_value,
        duration_years: components["building"].default_years,
        start_date: acqDate,
        hint: `${components["building"].default_years} ans — ${formatEuro(selectedProperty.building_value / components["building"].default_years)}/an`,
      });
    }
    if (selectedProperty.furniture_value > 0 && components["furniture"]) {
      sugs.push({
        component: "furniture",
        label: components["furniture"].label,
        value: selectedProperty.furniture_value,
        duration_years: components["furniture"].default_years,
        start_date: acqDate,
        hint: `${components["furniture"].default_years} ans — ${formatEuro(selectedProperty.furniture_value / components["furniture"].default_years)}/an`,
      });
    }
    if (selectedProperty.acquisition_costs > 0 && components["acquisition_costs"]) {
      sugs.push({
        component: "acquisition_costs",
        label: components["acquisition_costs"].label,
        value: selectedProperty.acquisition_costs,
        duration_years: components["acquisition_costs"].default_years,
        start_date: acqDate,
        hint: `${components["acquisition_costs"].default_years} ans — ${formatEuro(selectedProperty.acquisition_costs / components["acquisition_costs"].default_years)}/an`,
      });
    }
    setSuggestions(sugs);
  };

  const addSuggestion = async (sug: Suggestion) => {
    if (!selectedPropertyId) return;
    await depreciationApi.create({
      property_id: selectedPropertyId,
      component: sug.component,
      component_label: sug.label,
      value: sug.value,
      duration_years: sug.duration_years,
      start_date: sug.start_date,
      method: "linear",
      fiscal_year: selectedYear,
    });
    load();
    setSuggestions((prev) => prev.filter((s) => s.component !== sug.component));
  };

  const addAllSuggestions = async () => {
    if (!selectedPropertyId || !suggestions.length) return;
    setAddingAll(true);
    try {
      for (const sug of suggestions) {
        await depreciationApi.create({
          property_id: selectedPropertyId,
          component: sug.component,
          component_label: sug.label,
          value: sug.value,
          duration_years: sug.duration_years,
          start_date: sug.start_date,
          method: "linear",
          fiscal_year: selectedYear,
        });
      }
      setSuggestions([]);
      load();
    } finally {
      setAddingAll(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedPropertyId || !form.component || !form.value || !form.start_date) return;
    const comp = components[form.component];
    await depreciationApi.create({
      property_id: selectedPropertyId,
      component: form.component,
      component_label: comp?.label ?? form.component,
      value: parseFloat(form.value),
      duration_years: parseInt(form.duration_years),
      start_date: form.start_date,
      method: "linear",
      fiscal_year: selectedYear,
    });
    setShowForm(false);
    setForm({ component: "", value: "", duration_years: "", start_date: "" });
    load();
  };

  const handleDelete = async (id: number) => {
    await depreciationApi.delete(id);
    load();
  };

  const handleCompute = async () => {
    if (!selectedPropertyId) return;
    setComputing(true);
    try {
      const { fiscalApi } = await import("../lib/api");
      const s = await fiscalApi.summary(selectedPropertyId, selectedYear);
      const resultBeforeDep = s.data.result_before_depreciation;
      const r = await depreciationApi.compute(selectedPropertyId, selectedYear, resultBeforeDep);
      setComputeResult({
        total_annual: r.data.total_annual,
        total_deductible: r.data.total_deductible,
        total_carried_over: r.data.total_carried_over,
      });
      load();
    } finally {
      setComputing(false);
    }
  };

  const existingComponents = new Set(plans.map((p) => p.component));
  const filteredSuggestions = suggestions.filter((s) => !existingComponents.has(s.component));

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Amortissements — {selectedYear}</h2>
          <p className="text-gray-500 mt-1">Plan d'amortissement par composant</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleCompute} disabled={computing || plans.length === 0} className="btn-secondary">
            <Calculator className="w-4 h-4" />
            {computing ? "Calcul…" : "Calculer"}
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        </div>
      </div>

      {properties.length > 1 && (
        <div className="mb-6">
          <label className="form-label">Bien</label>
          <select
            value={selectedPropertyId ?? ""}
            onChange={(e) => setSelectedProperty(Number(e.target.value))}
            className="form-input max-w-xs"
          >
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* Auto-generate panel — shown when no plans yet or user requests */}
      {selectedProperty && plans.length === 0 && (
        <div className="card mb-6 bg-indigo-50 border-indigo-200">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="w-4 h-4 text-indigo-600" />
            <h3 className="font-semibold text-indigo-900 text-sm">Générer automatiquement depuis le bien</h3>
          </div>
          <p className="text-xs text-indigo-700 mb-3">
            Les valeurs saisies dans la décomposition patrimoniale du bien permettent de pré-remplir vos composants d'amortissement.
          </p>
          {filteredSuggestions.length === 0 && suggestions.length === 0 && (
            <button
              type="button"
              onClick={buildSuggestions}
              className="btn-secondary text-sm"
            >
              <Wand2 className="w-4 h-4" /> Voir les suggestions
            </button>
          )}
          {filteredSuggestions.length > 0 && (
            <>
              <div className="space-y-2 mb-3">
                {filteredSuggestions.map((sug) => (
                  <div
                    key={sug.component}
                    className="flex items-center justify-between bg-white rounded-lg border border-indigo-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{sug.label}</p>
                      <p className="text-xs text-gray-500">
                        {formatEuro(sug.value)} — {sug.hint}
                      </p>
                      {COMPONENT_HINTS[sug.component] && (
                        <p className="text-xs text-indigo-600 mt-0.5">{COMPONENT_HINTS[sug.component]}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => addSuggestion(sug)}
                      className="btn-secondary text-xs ml-4 flex-shrink-0"
                    >
                      Ajouter
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addAllSuggestions}
                disabled={addingAll}
                className="btn-primary text-sm"
              >
                {addingAll ? "Ajout en cours…" : "Ajouter tous les composants"}
              </button>
            </>
          )}
          {suggestions.length > 0 && filteredSuggestions.length === 0 && (
            <p className="text-xs text-green-700">Tous les composants suggérés ont été ajoutés.</p>
          )}
        </div>
      )}

      {/* Manual add form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-4">Nouveau composant</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Type de composant *</label>
              <select
                value={form.component}
                onChange={(e) => handleComponentChange(e.target.value)}
                className="form-input"
              >
                <option value="">-- Choisir --</option>
                {Object.entries(components).map(([key, c]) => (
                  <option key={key} value={key}>{c.label}</option>
                ))}
              </select>
              {form.component && COMPONENT_HINTS[form.component] && (
                <p className="text-xs text-indigo-600 mt-1 flex items-start gap-1">
                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  {COMPONENT_HINTS[form.component]}
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Valeur (€) *</label>
              <input
                type="number"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
                className="form-input"
                placeholder={
                  form.component === "building" && selectedProperty
                    ? String(selectedProperty.building_value)
                    : form.component === "furniture" && selectedProperty
                    ? String(selectedProperty.furniture_value)
                    : ""
                }
              />
            </div>
            <div>
              <label className="form-label">Durée d'amortissement (ans) *</label>
              <input
                type="number"
                min="1"
                max="100"
                value={form.duration_years}
                onChange={(e) => setForm((p) => ({ ...p, duration_years: e.target.value }))}
                className="form-input"
              />
              {form.component && components[form.component] && (
                <p className="text-xs text-gray-500 mt-1">
                  Recommandé : {components[form.component].min_years}–{components[form.component].max_years} ans
                  {form.value && form.duration_years
                    ? ` — soit ${formatEuro(parseFloat(form.value) / parseInt(form.duration_years))}/an`
                    : ""}
                </p>
              )}
            </div>
            <div>
              <label className="form-label">Date de début *</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                className="form-input"
              />
              {selectedProperty && !form.start_date && (
                <button
                  type="button"
                  className="text-xs text-primary-600 mt-1 underline"
                  onClick={() =>
                    setForm((p) => ({ ...p, start_date: selectedProperty.acquisition_date }))
                  }
                >
                  Utiliser la date d'acquisition ({new Date(selectedProperty.acquisition_date).toLocaleDateString("fr-FR")})
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} className="btn-primary">Ajouter</button>
            <button onClick={() => { setShowForm(false); setForm({ component: "", value: "", duration_years: "", start_date: "" }); }} className="btn-secondary">Annuler</button>
          </div>
        </div>
      )}

      {/* Compute result */}
      {computeResult && (
        <div className="card mb-6 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-3">Résultat du calcul</h3>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-blue-600 text-xs">Amort. théorique annuel</p>
              <p className="text-xl font-bold text-blue-900">{formatEuro(computeResult.total_annual)}</p>
            </div>
            <div>
              <p className="text-blue-600 text-xs">Déduit (plafonné au résultat)</p>
              <p className="text-xl font-bold text-green-700">{formatEuro(computeResult.total_deductible)}</p>
            </div>
            <div>
              <p className="text-blue-600 text-xs">Reporté N+1 (CGI art. 39 C)</p>
              <p className="text-xl font-bold text-orange-600">{formatEuro(computeResult.total_carried_over)}</p>
            </div>
          </div>
          {computeResult.total_carried_over > 0 && (
            <p className="text-xs text-orange-700 mt-2">
              L'amortissement ne peut pas créer de déficit. L'excédent est reporté indéfiniment sur les exercices futurs.
            </p>
          )}
        </div>
      )}

      {/* Plans table */}
      {plans.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="mb-2">Aucun composant d'amortissement.</p>
          <p className="text-sm">
            {selectedProperty && (selectedProperty.building_value > 0 || selectedProperty.furniture_value > 0)
              ? "Utilisez le panneau de génération automatique ci-dessus pour démarrer."
              : "Ajoutez un composant pour optimiser vos déductions fiscales."}
          </p>
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-500 font-medium">Composant</th>
                <th className="text-right py-2 text-gray-500 font-medium">Valeur</th>
                <th className="text-right py-2 text-gray-500 font-medium">Durée</th>
                <th className="text-right py-2 text-gray-500 font-medium">Annuel</th>
                <th className="text-right py-2 text-gray-500 font-medium">Déduit</th>
                <th className="text-right py-2 text-gray-500 font-medium">Reporté</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-2 font-medium">{p.component_label}</td>
                  <td className="py-2 text-right">{formatEuro(p.value)}</td>
                  <td className="py-2 text-right">{p.duration_years} ans</td>
                  <td className="py-2 text-right">{formatEuro(p.annual_amount)}</td>
                  <td className="py-2 text-right text-green-700 font-medium">{formatEuro(p.deductible_amount)}</td>
                  <td className="py-2 text-right text-orange-600">{formatEuro(p.carried_over)}</td>
                  <td className="py-2 pl-2">
                    <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t">
              <tr>
                <td colSpan={3} className="py-2 text-sm font-semibold text-gray-700">Total</td>
                <td className="py-2 text-right font-semibold">{formatEuro(plans.reduce((s, p) => s + p.annual_amount, 0))}</td>
                <td className="py-2 text-right font-semibold text-green-700">{formatEuro(plans.reduce((s, p) => s + p.deductible_amount, 0))}</td>
                <td className="py-2 text-right font-semibold text-orange-600">{formatEuro(plans.reduce((s, p) => s + p.carried_over, 0))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
