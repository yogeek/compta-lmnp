import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Receipt, Plus, Trash2, Edit2, Info, X } from "lucide-react";
import { expensesApi, propertiesApi, type Expense, type Property } from "../lib/api";
import { useLmnpStore } from "../store";

interface Category { key: string; label: string; account: string; }

// Helpful descriptions for each expense category
const CATEGORY_HINTS: Record<string, string> = {
  management_fees: "Honoraires d'agence locative, frais de gestion courante, syndic de copropriété.",
  insurance: "Assurance propriétaire non-occupant (PNO), assurance loyers impayés (GLI).",
  property_tax: "Taxe foncière (hors ordures ménagères si refacturées au locataire).",
  repairs: "Travaux d'entretien et réparations (peinture, plomberie, électricité). Attention : les travaux d'amélioration sont à amortir.",
  accountant: "Honoraires d'expert-comptable, cotisation CGA (Centre de Gestion Agréé).",
  interest: "Intérêts d'emprunt et frais de dossier du crédit immobilier.",
  misc: "Autres charges non listées (téléphone, fournitures, frais de déplacement liés au bien…).",
};

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

type FormData = {
  date: string;
  amount: number;
  category: string;
  description: string;
  deductible_pct: number;
};

export default function Expenses() {
  const { selectedPropertyId, setSelectedProperty, selectedYear } = useLmnpStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const { register, handleSubmit, reset, watch } = useForm<FormData>({
    defaultValues: { deductible_pct: 100 },
  });

  const watchedCategory = watch("category");

  const load = () => {
    if (!selectedPropertyId) return;
    expensesApi.list(selectedPropertyId, selectedYear).then((r) => setExpenses(r.data));
  };

  useEffect(() => {
    propertiesApi.list().then((r) => {
      setProperties(r.data);
      if (!selectedPropertyId && r.data.length > 0) setSelectedProperty(r.data[0].id);
    });
    expensesApi.categories(selectedYear).then((r) => setCategories(r.data));
  }, []);

  useEffect(() => { load(); }, [selectedPropertyId, selectedYear]);

  const openAdd = () => {
    setEditingId(null);
    reset({ deductible_pct: 100, date: "", amount: 0, category: "", description: "" });
    setError("");
    setShowForm(true);
  };

  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    reset({
      date: e.date,
      amount: e.amount,
      category: e.category,
      description: e.description ?? "",
      deductible_pct: e.deductible_pct,
    });
    setError("");
    setShowForm(true);
  };

  const onSubmit = async (data: FormData) => {
    setError("");
    if (!selectedPropertyId) return;
    const payload = {
      property_id: selectedPropertyId,
      fiscal_year: selectedYear,
      date: data.date,
      amount: Number(data.amount),
      category: data.category,
      description: data.description,
      deductible_pct: Number(data.deductible_pct),
    };
    try {
      if (editingId !== null) {
        await expensesApi.update(editingId, payload);
      } else {
        await expensesApi.create(payload);
      }
      setShowForm(false);
      setEditingId(null);
      reset();
      load();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Erreur.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer cette charge ?")) return;
    await expensesApi.delete(id);
    load();
  };

  const total = expenses.reduce((s, e) => s + e.amount * e.deductible_pct / 100, 0);

  const byCategory = expenses.reduce((acc, e) => {
    const net = e.amount * e.deductible_pct / 100;
    acc[e.category] = (acc[e.category] ?? 0) + net;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Charges déductibles — {selectedYear}</h2>
          <p className="text-gray-500 mt-1">Saisissez toutes vos charges déductibles</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Ajouter une charge
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

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{editingId !== null ? "Modifier la charge" : "Nouvelle charge"}</h3>
            <button
              type="button"
              onClick={() => { setShowForm(false); setEditingId(null); reset(); }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Date *</label>
                <input type="date" {...register("date", { required: true })} className="form-input" />
              </div>
              <div>
                <label className="form-label">Montant (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  {...register("amount", { required: true, valueAsNumber: true })}
                  className="form-input"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Catégorie *</label>
                <select {...register("category", { required: true })} className="form-input">
                  <option value="">-- Choisir --</option>
                  {categories.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                {watchedCategory && CATEGORY_HINTS[watchedCategory] && (
                  <p className="text-xs text-indigo-600 mt-1 flex items-start gap-1">
                    <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    {CATEGORY_HINTS[watchedCategory]}
                  </p>
                )}
              </div>
              <div>
                <label className="form-label">Taux déductible (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  {...register("deductible_pct", { valueAsNumber: true })}
                  className="form-input"
                />
                <p className="text-xs text-gray-400 mt-1">
                  100 % par défaut. Réduire si usage mixte (ex : 50 % pour une charge partagée).
                </p>
              </div>
            </div>
            <div>
              <label className="form-label">Description</label>
              <input {...register("description")} className="form-input" placeholder="Description optionnelle (facture, référence…)" />
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary">
                {editingId !== null ? "Enregistrer" : "Ajouter"}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); reset(); }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Summary by category */}
      {Object.keys(byCategory).length > 0 && (
        <div className="card mb-6">
          <h3 className="font-semibold mb-3">Récapitulatif par catégorie</h3>
          <div className="space-y-2">
            {Object.entries(byCategory)
              .sort(([, a], [, b]) => b - a)
              .map(([key, amount]) => {
                const cat = categories.find((c) => c.key === key);
                const pct = total > 0 ? (amount / total) * 100 : 0;
                return (
                  <div key={key}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="text-gray-600">{cat?.label ?? key}</span>
                      <span className="font-medium">{formatEuro(amount)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            <div className="flex justify-between font-bold pt-2 border-t">
              <span>Total déductible</span>
              <span className="text-red-700">{formatEuro(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Expenses list */}
      {expenses.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">
          <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="mb-2">Aucune charge enregistrée.</p>
          <p className="text-sm">N'oubliez pas : taxe foncière, assurance PNO, intérêts d'emprunt, frais de gestion…</p>
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                <th className="text-left py-2 text-gray-500 font-medium">Description</th>
                <th className="text-left py-2 text-gray-500 font-medium">Catégorie</th>
                <th className="text-right py-2 text-gray-500 font-medium">Montant</th>
                <th className="text-right py-2 text-gray-500 font-medium">Déductible</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const cat = categories.find((c) => c.key === e.category);
                return (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2">{new Date(e.date).toLocaleDateString("fr-FR")}</td>
                    <td className="py-2 text-gray-600">{e.description ?? "—"}</td>
                    <td className="py-2">
                      <span className="badge-info">{cat?.label ?? e.category}</span>
                    </td>
                    <td className="py-2 text-right">{formatEuro(e.amount)}</td>
                    <td className="py-2 text-right font-medium text-red-700">
                      {formatEuro(e.amount * e.deductible_pct / 100)}
                      {e.deductible_pct < 100 && (
                        <span className="text-gray-400 font-normal ml-1 text-xs">({e.deductible_pct}%)</span>
                      )}
                    </td>
                    <td className="py-2 pl-2 flex gap-1">
                      <button
                        onClick={() => openEdit(e)}
                        className="p-1 text-gray-400 hover:text-primary-600"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
