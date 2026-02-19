import { useEffect, useState } from "react";
import { TrendingUp, Save, Wand2 } from "lucide-react";
import { revenuesApi, propertiesApi, type Property } from "../lib/api";
import { useLmnpStore } from "../store";

const MONTHS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

export default function Revenues() {
  const { selectedPropertyId, setSelectedProperty, selectedYear } = useLmnpStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [monthlyValues, setMonthlyValues] = useState<Record<number, string>>({});
  const [existingIds, setExistingIds] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Quick fill state
  const [quickAmount, setQuickAmount] = useState("");
  const [quickFromMonth, setQuickFromMonth] = useState(1);

  useEffect(() => {
    propertiesApi.list().then((r) => {
      setProperties(r.data);
      if (!selectedPropertyId && r.data.length > 0) setSelectedProperty(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedPropertyId) return;
    revenuesApi.list(selectedPropertyId, selectedYear).then((r) => {
      const vals: Record<number, string> = {};
      const ids: Record<number, number> = {};
      r.data.forEach((rev) => {
        vals[rev.month] = String(rev.amount);
        ids[rev.month] = rev.id;
      });
      setMonthlyValues(vals);
      setExistingIds(ids);
    });
  }, [selectedPropertyId, selectedYear]);

  const total = Object.values(monthlyValues).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const filledCount = Object.values(monthlyValues).filter((v) => parseFloat(v) > 0).length;

  const applyQuickFill = (fromMonth: number) => {
    const parsed = parseFloat(quickAmount);
    if (isNaN(parsed) || parsed < 0) return;
    setMonthlyValues((prev) => {
      const next = { ...prev };
      for (let m = fromMonth; m <= 12; m++) {
        next[m] = quickAmount;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedPropertyId) return;
    setSaving(true);
    try {
      for (let month = 1; month <= 12; month++) {
        const amount = parseFloat(monthlyValues[month] || "0");
        const existingId = existingIds[month];
        const data = {
          property_id: selectedPropertyId,
          fiscal_year: selectedYear,
          month,
          amount,
          type: "loyer" as const,
          notes: null,
        };
        if (existingId) {
          await revenuesApi.update(existingId, data);
        } else if (amount > 0) {
          const r = await revenuesApi.create(data);
          setExistingIds((prev) => ({ ...prev, [month]: r.data.id }));
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Revenus locatifs — {selectedYear}</h2>
          <p className="text-gray-500 mt-1">Saisissez vos loyers mensuels par bien</p>
        </div>
        <button onClick={handleSave} disabled={saving || !selectedPropertyId} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? "Enregistrement…" : saved ? "Enregistré ✓" : "Enregistrer"}
        </button>
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

      {!selectedPropertyId ? (
        <div className="card text-center text-gray-500 py-12">
          Aucun bien sélectionné. Créez d'abord un bien dans la section "Biens".
        </div>
      ) : (
        <>
          {/* Quick fill panel */}
          <div className="card mb-4 bg-indigo-50 border-indigo-200">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 className="w-4 h-4 text-indigo-600" />
              <h3 className="font-semibold text-indigo-900 text-sm">Remplissage rapide</h3>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-xs text-indigo-700 font-medium mb-1 block">Loyer mensuel (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="ex : 850"
                  className="form-input w-32"
                />
              </div>
              <div>
                <label className="text-xs text-indigo-700 font-medium mb-1 block">À partir de</label>
                <select
                  value={quickFromMonth}
                  onChange={(e) => setQuickFromMonth(Number(e.target.value))}
                  className="form-input"
                >
                  {MONTHS.map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => applyQuickFill(quickFromMonth)}
                disabled={!quickAmount}
                className="btn-secondary"
              >
                Appliquer
              </button>
              <button
                type="button"
                onClick={() => { setQuickFromMonth(1); applyQuickFill(1); }}
                disabled={!quickAmount}
                className="btn-secondary text-sm"
              >
                Toute l'année
              </button>
            </div>
            <p className="text-xs text-indigo-500 mt-2">
              Idéal pour un loyer stable, ou une augmentation en cours d'année.
            </p>
          </div>

          {/* Monthly grid */}
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">Loyers mensuels</h3>
              </div>
              <span className="text-xs text-gray-500">{filledCount}/12 mois renseignés</span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-gray-100 rounded-full mb-5 overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${(filledCount / 12) * 100}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {MONTHS.map((name, i) => {
                const month = i + 1;
                const val = monthlyValues[month] ?? "";
                const isFilled = parseFloat(val) > 0;
                return (
                  <div key={month}>
                    <label
                      className={`text-xs mb-1 block font-medium ${
                        isFilled ? "text-green-700" : "text-gray-400"
                      }`}
                    >
                      {name}
                      {isFilled && <span className="ml-1">✓</span>}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={val}
                        onChange={(e) =>
                          setMonthlyValues((prev) => ({ ...prev, [month]: e.target.value }))
                        }
                        placeholder="0"
                        className={`form-input pr-5 transition-colors ${
                          isFilled ? "border-green-300 bg-green-50 focus:border-green-500" : ""
                        }`}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">€</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className="card bg-green-50 border-green-200">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-gray-700">Total annuel</span>
              <span className="text-2xl font-bold text-green-700">{formatEuro(total)}</span>
            </div>
            {filledCount === 12 && (
              <p className="text-xs text-green-600 mt-1">
                Tous les mois renseignés — moyenne de {formatEuro(total / 12)}/mois.
              </p>
            )}
            {filledCount > 0 && filledCount < 12 && (
              <p className="text-xs text-amber-600 mt-1">
                {12 - filledCount} mois non renseignés. Si le bien était vacant, c'est normal.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
