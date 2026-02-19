import { useEffect, useState } from "react";
import { FileText, TrendingUp, TrendingDown, AlertCircle, CheckCircle, Info } from "lucide-react";
import { fiscalApi, propertiesApi, type FiscalSummary as FSummary, type ValidationIssue, type ComparisonResult, type Property } from "../lib/api";
import { useLmnpStore } from "../store";
import clsx from "clsx";

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(v);
}

function Row({ label, value, bold, positive }: { label: string; value: string; bold?: boolean; positive?: boolean }) {
  return (
    <div className={clsx("flex justify-between py-2 border-b last:border-0 text-sm", bold && "font-semibold")}>
      <span className="text-gray-600">{label}</span>
      <span className={clsx(positive === true && "text-green-700", positive === false && "text-red-700")}>{value}</span>
    </div>
  );
}

function IssueItem({ issue }: { issue: ValidationIssue }) {
  const icons = { error: AlertCircle, warning: AlertCircle, info: Info };
  const Icon = icons[issue.level];
  const colors = { error: "bg-red-50 text-red-700 border-red-200", warning: "bg-yellow-50 text-yellow-700 border-yellow-200", info: "bg-blue-50 text-blue-700 border-blue-200" };
  return (
    <div className={clsx("flex gap-2 p-3 rounded-lg border text-sm", colors[issue.level])}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <p>{issue.message}</p>
        {issue.cgi_ref && <p className="text-xs opacity-70 mt-0.5">Réf. : {issue.cgi_ref}</p>}
      </div>
    </div>
  );
}

export default function FiscalSummaryPage() {
  const { selectedPropertyId, setSelectedProperty, selectedYear } = useLmnpStore();
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<FSummary | null>(null);
  const [validation, setValidation] = useState<{ has_errors: boolean; issues: ValidationIssue[] } | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!selectedPropertyId) return;
    setLoading(true);
    try {
      const [s, v, c] = await Promise.all([
        fiscalApi.summary(selectedPropertyId, selectedYear),
        fiscalApi.validate(selectedPropertyId, selectedYear),
        fiscalApi.compare(selectedPropertyId, selectedYear),
      ]);
      setSummary(s.data);
      setValidation(v.data);
      setComparison(c.data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    propertiesApi.list().then((r) => {
      setProperties(r.data);
      if (!selectedPropertyId && r.data.length > 0) setSelectedProperty(r.data[0].id);
    });
  }, []);

  useEffect(() => { load(); }, [selectedPropertyId, selectedYear]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Récapitulatif fiscal — {selectedYear}</h2>
        <p className="text-gray-500 mt-1">Synthèse de votre exercice LMNP</p>
      </div>

      {properties.length > 1 && (
        <div className="mb-6">
          <label className="form-label">Bien</label>
          <select value={selectedPropertyId ?? ""} onChange={(e) => setSelectedProperty(Number(e.target.value))} className="form-input max-w-xs">
            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Calcul en cours…</div>
      ) : !summary ? (
        <div className="card text-center text-gray-500 py-12">Aucune donnée pour cet exercice.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compte de résultat */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold">Compte de résultat</h3>
            </div>
            <Row label="Total revenus (FL)" value={formatEuro(summary.total_revenue)} positive />
            <Row label="Total charges (GM)" value={formatEuro(summary.total_expenses)} />
            <Row label="Résultat avant amort." value={formatEuro(summary.result_before_depreciation)} bold />
            <Row label="Amort. théorique annuel" value={formatEuro(summary.total_depreciation_annual)} />
            <Row label="Amort. déduit (HA)" value={formatEuro(summary.total_depreciation_deductible)} />
            <Row label="Amort. reporté N+1" value={formatEuro(summary.total_depreciation_carried)} />
            <div className={clsx("mt-4 p-3 rounded-lg text-center", summary.fiscal_result >= 0 ? "bg-green-50" : "bg-red-50")}>
              <p className="text-xs font-medium text-gray-500 mb-1">Résultat fiscal</p>
              <p className={clsx("text-3xl font-bold", summary.fiscal_result >= 0 ? "text-green-700" : "text-red-700")}>
                {formatEuro(summary.fiscal_result)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {summary.fiscal_result >= 0 ? "Bénéfice imposable" : "Déficit reportable"}
              </p>
            </div>
          </div>

          {/* Bilan simplifié */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold">Bilan simplifié</h3>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Actif</p>
            <Row label="Immobilisations brutes (AA)" value={formatEuro(summary.balance_sheet.asset_gross)} />
            <Row label="Amort. cumulés (AB)" value={formatEuro(summary.balance_sheet.asset_depreciation_cumul)} />
            <Row label="Immobilisations nettes (AC)" value={formatEuro(summary.balance_sheet.asset_net)} bold />
            <Row label="Disponibilités (BH)" value={formatEuro(summary.balance_sheet.cash)} />
            <Row label="TOTAL ACTIF (BJ)" value={formatEuro(summary.balance_sheet.total_assets)} bold />
            <p className="text-xs font-semibold text-gray-400 uppercase mt-3 mb-2">Passif</p>
            <Row label="Capitaux propres (DA)" value={formatEuro(summary.balance_sheet.equity)} />
            <Row label="TOTAL PASSIF (EE)" value={formatEuro(summary.balance_sheet.total_liabilities_equity)} bold />
          </div>

          {/* Comparatif Micro-BIC vs Réel */}
          {comparison && (
            <div className="card lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-primary-600" />
                <h3 className="font-semibold">Comparatif Micro-BIC vs Régime Réel</h3>
              </div>
              <div className="grid grid-cols-2 gap-6 mb-4">
                <div className={clsx("p-4 rounded-lg border-2", comparison.recommended_regime === "micro_bic" ? "border-green-400 bg-green-50" : "border-gray-200")}>
                  <p className="font-semibold text-gray-700 mb-1">Micro-BIC</p>
                  <p className="text-sm text-gray-500">Abattement {comparison.micro_bic.abatement_pct}%</p>
                  <p className="text-2xl font-bold mt-2">{formatEuro(comparison.micro_bic.taxable_base)}</p>
                  <p className="text-xs text-gray-500">base imposable</p>
                  {comparison.above_threshold && (
                    <p className="text-xs text-red-600 mt-1">⚠ Seuil dépassé ({formatEuro(comparison.micro_bic.threshold)})</p>
                  )}
                </div>
                <div className={clsx("p-4 rounded-lg border-2", comparison.recommended_regime === "reel" ? "border-green-400 bg-green-50" : "border-gray-200")}>
                  <p className="font-semibold text-gray-700 mb-1">Régime Réel</p>
                  <p className="text-sm text-gray-500">Charges et amort. réels</p>
                  <p className="text-2xl font-bold mt-2">{formatEuro(comparison.reel.taxable_base)}</p>
                  <p className="text-xs text-gray-500">base imposable</p>
                  {comparison.reel.deficit > 0 && (
                    <p className="text-xs text-blue-600 mt-1">Déficit reportable : {formatEuro(comparison.reel.deficit)}</p>
                  )}
                </div>
              </div>
              <div className={clsx("p-3 rounded-lg text-sm", comparison.recommended_regime === "reel" ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800")}>
                {comparison.explanation}
              </div>
            </div>
          )}

          {/* Validation */}
          {validation && (
            <div className="card lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                {validation.has_errors ? <AlertCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />}
                <h3 className="font-semibold">Contrôles de cohérence</h3>
              </div>
              {validation.issues.length === 0 ? (
                <p className="text-sm text-green-700">✓ Aucun problème détecté. Votre déclaration semble cohérente.</p>
              ) : (
                <div className="space-y-2">
                  {validation.issues.map((issue, i) => <IssueItem key={i} issue={issue} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
