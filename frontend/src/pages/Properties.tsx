import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Building2, Plus, Trash2, Edit2, AlertTriangle, CheckCircle,
  ToggleLeft, ToggleRight, AlertCircle, ChevronDown, ChevronUp,
  ExternalLink, Copy, Check, Search,
} from "lucide-react";
import { propertiesApi, type Property } from "../lib/api";
import { LabelWithTooltip } from "../components/Tooltip";

const schema = z
  .object({
    name: z.string().min(1, "Nom obligatoire"),
    address: z.string().optional(),
    acquisition_date: z.string().min(1, "Date obligatoire"),
    total_price: z.number().positive("Prix total doit être positif"),
    land_value: z.number().min(0),
    building_value: z.number().min(0),
    furniture_value: z.number().min(0),
    acquisition_costs: z.number().min(0),
    siret: z.string().optional(),
  })
  .refine(
    (d) => d.land_value + d.building_value + d.furniture_value + d.acquisition_costs <= d.total_price + 0.01,
    { message: "La somme des composants dépasse le prix total", path: ["building_value"] }
  );

type FormData = z.infer<typeof schema>;

// ─── Situation fiscale ──────────────────────────────────────────────────────

type Situation = "" | "recent" | "converted" | "regime_change";

const SITUATIONS: {
  key: Situation;
  short: string;
  title: string;
  value: string;
  disables: string[];
}[] = [
  {
    key: "recent",
    short: "Achat direct",
    title: "Achat récent, mis en location meublée aussitôt",
    value: "Prix figurant dans l'acte notarié. Les frais de notaire et d'agence sont saisibles séparément dans la décomposition ci-dessous.",
    disables: [],
  },
  {
    key: "converted",
    short: "Bien converti",
    title: "Bien anciennement loué nu ou occupé en RP, converti en LMNP",
    value: "Valeur vénale à la date de première mise en location meublée (pas le prix d'achat historique). Les frais d'acquisition de l'acte original ne sont pas capitalisables.",
    disables: ["acquisition_costs"],
  },
  {
    key: "regime_change",
    short: "Micro → Réel",
    title: "Passage du régime Micro-BIC au régime réel",
    value: "Valeur retenue lors de l'immatriculation LMNP initiale. Les frais d'acquisition ne s'appliquent pas à cette valeur de bascule.",
    disables: ["acquisition_costs"],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatPct(v: number) {
  return `${v.toFixed(1)} %`;
}

function parseAddress(address: string): { commune: string; codePostal: string } {
  const match = address.match(/(\d{5})\s+([A-Za-zÀ-ÿ\s'-]+?)(?:[,\s]|$)/);
  if (match) return { codePostal: match[1], commune: match[2].trim() };
  return { commune: "", codePostal: "" };
}

// ─── DVF types ──────────────────────────────────────────────────────────────

interface DvfMutation {
  datemut: string;
  valeurfonc: string;  // API returns decimal string e.g. "195000.00"
  sbati: string;       // API returns decimal string e.g. "65.00"
  libtypbien: string;
  nblocmut: number;
}

interface DvfApiResponse {
  count?: number;
  results: DvfMutation[];
}

type SortCol = "date" | "surface" | "prix" | "prixm2";

// ─── PriceContextPanel ──────────────────────────────────────────────────────

function PriceContextPanel({
  address,
  situation,
  onSituationChange,
}: {
  address: string;
  situation: Situation;
  onSituationChange: (s: Situation) => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dvfLoading, setDvfLoading] = useState(false);
  const [dvfResults, setDvfResults] = useState<DvfMutation[] | null>(null);
  const [dvfError, setDvfError] = useState("");
  const [surfaceInput, setSurfaceInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sortState, setSortState] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "date", dir: "desc" });
  const [showTable, setShowTable] = useState(true);

  const { commune, codePostal } = parseAddress(address);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Retry once on network errors (TypeError) — first call often fails due to
  // cold TCP/TLS connection establishment to CEREMA preprod server
  const fetchWithRetry = async (url: string): Promise<Response> => {
    try {
      return await fetch(url);
    } catch {
      // Short pause then retry once
      await new Promise((r) => setTimeout(r, 400));
      return fetch(url);
    }
  };

  const fetchDvf = async () => {
    if (!codePostal) return;
    setDvfLoading(true);
    setDvfError("");
    setDvfResults(null);
    setShowTable(true);
    try {
      // Step 1: resolve postal code → INSEE commune code via geo.api.gouv.fr
      const geoRes = await fetchWithRetry(
        `https://geo.api.gouv.fr/communes?codePostal=${codePostal}&fields=code,nom`
      );
      if (!geoRes.ok) throw new Error(`geo API HTTP ${geoRes.status}`);
      const geoData: { code: string; nom: string }[] = await geoRes.json();
      if (!geoData.length) {
        setDvfResults([]);
        return;
      }

      // Handle Paris arrondissements: geo API returns 75056 for all 75001–75020 postal codes,
      // but CEREMA needs arrondissement-level codes 75101–75120
      let codeInsee = geoData[0].code;
      if (codeInsee === "75056" && /^750(0[1-9]|1\d|20)$/.test(codePostal)) {
        const arrNum = parseInt(codePostal.slice(3), 10);
        codeInsee = `751${String(arrNum).padStart(2, "0")}`;
      }

      // Step 2: query CEREMA DVF mutations API with INSEE code + optional surface range
      const surf = parseFloat(surfaceInput);
      const surfParams = surf > 0
        ? `&sbatimin=${Math.round(surf * 0.65)}&sbatimax=${Math.round(surf * 1.35)}`
        : "";
      const dvfRes = await fetchWithRetry(
        `https://apidf-preprod.cerema.fr/dvf_opendata/mutations/?code_insee=${codeInsee}&libnatmut=Vente&limit=20${surfParams}`
      );
      if (!dvfRes.ok) throw new Error(`DVF API HTTP ${dvfRes.status}`);
      const data: DvfApiResponse = await dvfRes.json();
      setDvfResults(data.results ?? []);
    } catch {
      setDvfError("Impossible de charger les données DVF. Utilisez les liens ci-dessous.");
    } finally {
      setDvfLoading(false);
    }
  };

  // Client-side filtering + sorting
  const surf = parseFloat(surfaceInput);
  const filteredResults = (dvfResults ?? [])
    .filter((m) => {
      const s = parseFloat(m.sbati);
      const v = parseFloat(m.valeurfonc);
      if (s <= 0 || v <= 0) return false;
      if (typeFilter && !m.libtypbien.toLowerCase().includes(typeFilter)) return false;
      // Safety-net surface filter in case API doesn't support sbatimin/sbatimax
      if (surf > 0 && (s < surf * 0.65 || s > surf * 1.35)) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortState.dir === "asc" ? 1 : -1;
      switch (sortState.col) {
        case "date": return dir * (a.datemut > b.datemut ? 1 : -1);
        case "surface": return dir * (parseFloat(a.sbati) - parseFloat(b.sbati));
        case "prix": return dir * (parseFloat(a.valeurfonc) - parseFloat(b.valeurfonc));
        case "prixm2": return dir * (
          parseFloat(a.valeurfonc) / parseFloat(a.sbati) -
          parseFloat(b.valeurfonc) / parseFloat(b.sbati)
        );
        default: return 0;
      }
    });

  const handleSort = (col: SortCol) => {
    setSortState((prev) => ({
      col,
      dir: prev.col === col ? (prev.dir === "asc" ? "desc" : "asc") : "desc",
    }));
  };

  const sortIcon = (col: SortCol) =>
    sortState.col === col ? (sortState.dir === "asc" ? " ↑" : " ↓") : " ↕";

  const tools = [
    {
      name: "DVF — données officielles",
      badge: "Gratuit · État",
      description: "Base officielle de toutes les transactions immobilières en France. Référence opposable au fisc.",
      url: codePostal
        ? `https://explore.data.gouv.fr/fr/immobilier?commune_or_departement=${encodeURIComponent(commune || codePostal)}`
        : "https://explore.data.gouv.fr/fr/immobilier",
    },
    {
      name: "Patrim (DGFiP)",
      badge: "Gratuit · Connexion impots.gouv",
      description: "Outil officiel des impôts : transactions certifiées, reconnu lors des contrôles fiscaux.",
      url: "https://www.impots.gouv.fr/patrim",
    },
    {
      name: "Prix immobilier notaires.fr",
      badge: "Gratuit · Notaires de France",
      description: "Statistiques de marché par zone et par type de bien, publiées par les notaires.",
      url: "https://www.immobilier.notaires.fr/fr/prix-immobilier",
    },
    {
      name: "MeilleursAgents — Estimer",
      badge: "Algorithme",
      description: "Estimation automatique par adresse. Indicatif uniquement — à croiser avec DVF ou Patrim.",
      url: address
        ? `https://www.meilleursagents.com/estimer-mon-bien/?q=${encodeURIComponent(address)}`
        : "https://www.meilleursagents.com/estimer-mon-bien/",
    },
  ];

  return (
    <div className="mt-2">
      {/* Toggle button + situation badge when collapsed */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium"
        >
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Quel prix saisir ? · Estimer la valeur vénale
        </button>
        {situation && (
          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            {SITUATIONS.find((s) => s.key === situation)?.short}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-4">

          {/* Situation selector — clickable radio cards */}
          <div>
            <p className="text-xs font-semibold text-indigo-900 mb-2">
              Sélectionnez votre situation pour adapter la décomposition patrimoniale :
            </p>
            <div className="space-y-2">
              {SITUATIONS.map((s) => (
                <div
                  key={s.key}
                  onClick={() => onSituationChange(situation === s.key ? "" : s.key)}
                  className={`rounded-lg border p-2.5 text-xs cursor-pointer transition-all ${
                    situation === s.key
                      ? "bg-indigo-100 border-indigo-400 ring-1 ring-indigo-400"
                      : "bg-white border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Radio circle */}
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${
                      situation === s.key ? "border-indigo-500 bg-indigo-500" : "border-gray-300 bg-white"
                    }`}>
                      {situation === s.key && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="font-medium text-indigo-800 mb-0.5">{s.title}</p>
                      <p className="text-gray-600">{s.value}</p>
                      {s.disables.length > 0 && situation === s.key && (
                        <p className="text-amber-700 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          Les frais d'acquisition seront désactivés dans la décomposition ci-dessous.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <a
              href="https://www.decla.fr/blog/a-quelle-date-dois-je-immatriculer-mon-bien-en-lmnp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-900 hover:underline mt-2"
            >
              <ExternalLink className="w-3 h-3" /> Plus de détails sur decla.fr
            </a>
          </div>

          {/* DVF in-app lookup */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-indigo-900">
                Transactions récentes dans votre secteur (DVF officiel)
              </p>
              {address && (
                <button
                  type="button"
                  onClick={copyAddress}
                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                  title="Copier l'adresse pour la coller dans un outil d'estimation"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copié !" : "Copier l'adresse"}
                </button>
              )}
            </div>

            {!codePostal ? (
              <p className="text-xs text-indigo-500 italic">
                Saisissez l'adresse du bien (avec code postal) pour rechercher les transactions similaires dans votre secteur.
              </p>
            ) : (
              <>
                {/* Search filters */}
                <div className="flex flex-wrap gap-2 items-end mb-2">
                  <div>
                    <label className="block text-xs text-indigo-700 font-medium mb-1">Surface (m²)</label>
                    <input
                      type="number"
                      value={surfaceInput}
                      onChange={(e) => setSurfaceInput(e.target.value)}
                      placeholder="ex : 65"
                      className="form-input w-24 py-1 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-indigo-700 font-medium mb-1">Type de bien</label>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="form-input py-1 text-xs"
                    >
                      <option value="">Tous</option>
                      <option value="appartement">Appartement</option>
                      <option value="maison">Maison</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={fetchDvf}
                    disabled={dvfLoading}
                    className="flex items-center gap-1.5 text-xs btn-secondary py-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {dvfLoading
                      ? "Chargement…"
                      : `Rechercher${surf > 0 ? ` ~${surfaceInput} m²` : ""} à ${commune || codePostal}`}
                  </button>
                </div>

                {dvfLoading && (
                  <div className="text-xs text-indigo-500 flex items-center gap-2">
                    <div className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                    Chargement des données DVF…
                  </div>
                )}
                {dvfError && <p className="text-xs text-red-600">{dvfError}</p>}
                {dvfResults !== null && filteredResults.length === 0 && !dvfLoading && (
                  <p className="text-xs text-gray-500">
                    {dvfResults.length === 0
                      ? "Pas de données DVF disponibles pour cette commune (couverture CEREMA limitée). Consultez les outils ci-dessous."
                      : `Aucune transaction correspondant aux filtres (${dvfResults.length} transaction(s) au total dans la commune).`}
                  </p>
                )}
                {filteredResults.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-indigo-600">
                        {filteredResults.length} transaction(s) — {commune || codePostal}
                        {surf > 0 && ` · ±35 % autour de ${surfaceInput} m²`}
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTable((v) => !v)}
                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
                      >
                        {showTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {showTable ? "Masquer" : "Afficher"} le tableau
                      </button>
                    </div>
                    {showTable && (
                      <div className="overflow-x-auto rounded-lg border border-indigo-100">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-indigo-100 text-indigo-700 select-none">
                              <th className="text-left px-2 py-1.5 font-medium">Type</th>
                              <th
                                className="text-left px-2 py-1.5 font-medium cursor-pointer hover:bg-indigo-200"
                                onClick={() => handleSort("date")}
                              >
                                Date{sortIcon("date")}
                              </th>
                              <th
                                className="text-right px-2 py-1.5 font-medium cursor-pointer hover:bg-indigo-200"
                                onClick={() => handleSort("surface")}
                              >
                                Surface{sortIcon("surface")}
                              </th>
                              <th
                                className="text-right px-2 py-1.5 font-medium cursor-pointer hover:bg-indigo-200"
                                onClick={() => handleSort("prix")}
                              >
                                Prix{sortIcon("prix")}
                              </th>
                              <th
                                className="text-right px-2 py-1.5 font-medium cursor-pointer hover:bg-indigo-200"
                                onClick={() => handleSort("prixm2")}
                              >
                                €/m²{sortIcon("prixm2")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredResults.map((m, i) => {
                              const prix = parseFloat(m.valeurfonc);
                              const sfm = parseFloat(m.sbati);
                              return (
                                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-indigo-50/50"}>
                                  <td className="px-2 py-1.5 text-gray-600">{m.libtypbien}</td>
                                  <td className="px-2 py-1.5 text-gray-600">
                                    {new Date(m.datemut).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                                  </td>
                                  <td className="px-2 py-1.5 text-right">{sfm} m²</td>
                                  <td className="px-2 py-1.5 text-right font-medium">{formatEuro(prix)}</td>
                                  <td className="px-2 py-1.5 text-right text-indigo-700 font-medium">
                                    {formatEuro(prix / sfm)}/m²
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">
                      Source : Demandes de Valeurs Foncières (DVF) — données officielles de l'État français.
                      {surf === 0 && " Saisissez la surface pour affiner les résultats."}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* External estimation tools */}
          <div>
            <p className="text-xs font-semibold text-indigo-900 mb-2">Outils d'estimation en ligne</p>
            <div className="grid grid-cols-2 gap-2">
              {tools.map((t) => (
                <a
                  key={t.name}
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-2.5 bg-white rounded-lg border border-indigo-100 hover:border-indigo-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-xs font-medium text-indigo-700 group-hover:text-indigo-900 leading-tight">
                      {t.name}
                    </span>
                    <ExternalLink className="w-3 h-3 text-indigo-300 group-hover:text-indigo-500 flex-shrink-0 mt-0.5" />
                  </div>
                  <p className="text-xs text-gray-400 mb-1">{t.badge}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{t.description}</p>
                </a>
              ))}
            </div>
            <p className="text-xs text-indigo-500 mt-2">
              <strong>Conseil :</strong> Pour un contrôle fiscal, Patrim ou une expertise notariale sont les références opposables. MeilleursAgents est indicatif.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Visual breakdown bar ────────────────────────────────────────────────────

function BreakdownBar({
  total, land, building, furniture, costs,
}: { total: number; land: number; building: number; furniture: number; costs: number }) {
  if (!total) return null;
  const pct = (v: number) => Math.max(0, (v / total) * 100);
  const allocated = land + building + furniture + costs;
  const remaining = Math.max(0, total - allocated);

  return (
    <div className="mt-4">
      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
        {land > 0 && (
          <div
            className="bg-amber-400 transition-all duration-300"
            style={{ width: `${pct(land)}%` }}
            title={`Terrain: ${formatEuro(land)} (${formatPct(pct(land))})`}
          />
        )}
        {building > 0 && (
          <div
            className="bg-blue-500 transition-all duration-300"
            style={{ width: `${pct(building)}%` }}
            title={`Bâtiment: ${formatEuro(building)} (${formatPct(pct(building))})`}
          />
        )}
        {furniture > 0 && (
          <div
            className="bg-purple-400 transition-all duration-300"
            style={{ width: `${pct(furniture)}%` }}
            title={`Mobilier: ${formatEuro(furniture)} (${formatPct(pct(furniture))})`}
          />
        )}
        {costs > 0 && (
          <div
            className="bg-green-400 transition-all duration-300"
            style={{ width: `${pct(costs)}%` }}
            title={`Frais acq.: ${formatEuro(costs)} (${formatPct(pct(costs))})`}
          />
        )}
        {remaining > 1 && (
          <div
            className="bg-gray-200 transition-all duration-300 flex-1"
            title={`Non ventilé: ${formatEuro(remaining)}`}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
        {[
          { label: "Terrain", value: land, color: "bg-amber-400" },
          { label: "Bâtiment", value: building, color: "bg-blue-500" },
          { label: "Mobilier", value: furniture, color: "bg-purple-400" },
          { label: "Frais acq.", value: costs, color: "bg-green-400" },
          ...(remaining > 1 ? [{ label: "Non ventilé", value: remaining, color: "bg-gray-200" }] : []),
        ]
          .filter((s) => s.value > 0)
          .map((s) => (
            <div key={s.label} className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${s.color} flex-shrink-0`} />
              <span>{s.label}: {formatEuro(s.value)} ({formatPct((s.value / total) * 100)})</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Patrimonial decomposition ───────────────────────────────────────────────

interface DecompositionProps {
  totalPrice: number;
  register: ReturnType<typeof useForm<FormData>>["register"];
  setValue: ReturnType<typeof useForm<FormData>>["setValue"];
  watch: ReturnType<typeof useForm<FormData>>["watch"];
  errors: ReturnType<typeof useForm<FormData>>["formState"]["errors"];
  situation: Situation;
}

function PatrimonialDecomposition({ totalPrice, register, setValue, watch, errors, situation }: DecompositionProps) {
  const [pctMode, setPctMode] = useState(false);
  const [pctValues, setPctValues] = useState({ land: "", building: "", furniture: "", costs: "" });

  const costsDisabled = situation === "converted" || situation === "regime_change";

  const watched = {
    land: watch("land_value") || 0,
    building: watch("building_value") || 0,
    furniture: watch("furniture_value") || 0,
    costs: watch("acquisition_costs") || 0,
  };

  const allocated = watched.land + watched.building + watched.furniture + watched.costs;
  const remaining = totalPrice > 0 ? totalPrice - allocated : 0;
  const landPct = totalPrice > 0 ? (watched.land / totalPrice) * 100 : 0;

  // Reset acquisition_costs when situation disables it
  useEffect(() => {
    if (costsDisabled) {
      setValue("acquisition_costs", 0, { shouldValidate: true });
      setPctValues((prev) => ({ ...prev, costs: "" }));
    }
  }, [costsDisabled, setValue]);

  const toggleMode = () => {
    if (!pctMode && totalPrice > 0) {
      setPctValues({
        land: watched.land > 0 ? ((watched.land / totalPrice) * 100).toFixed(1) : "",
        building: watched.building > 0 ? ((watched.building / totalPrice) * 100).toFixed(1) : "",
        furniture: watched.furniture > 0 ? ((watched.furniture / totalPrice) * 100).toFixed(1) : "",
        costs: watched.costs > 0 && !costsDisabled ? ((watched.costs / totalPrice) * 100).toFixed(1) : "",
      });
    }
    setPctMode((m) => !m);
  };

  const applyPct = (field: keyof typeof pctValues, pctStr: string) => {
    const newPcts = { ...pctValues, [field]: pctStr };
    setPctValues(newPcts);
    const pct = parseFloat(pctStr);
    if (!isNaN(pct) && totalPrice > 0) {
      const fieldMap: Record<string, "land_value" | "building_value" | "furniture_value" | "acquisition_costs"> = {
        land: "land_value",
        building: "building_value",
        furniture: "furniture_value",
        costs: "acquisition_costs",
      };
      setValue(fieldMap[field], Math.round((pct / 100) * totalPrice * 100) / 100, { shouldValidate: true });
    }
  };

  // Fill (or trim) a field by the remaining unallocated amount.
  // Works both ways: adds remainder when under budget, subtracts excess when over.
  const fillRemaining = (
    key: keyof typeof pctValues,
    formField: "land_value" | "building_value" | "furniture_value" | "acquisition_costs"
  ) => {
    const currentVal = watch(formField) || 0;
    const newVal = Math.max(0, Math.round((currentVal + remaining) * 100) / 100);
    setValue(formField, newVal, { shouldValidate: true });
    if (pctMode && totalPrice > 0) {
      setPctValues((prev) => ({
        ...prev,
        [key]: ((newVal / totalPrice) * 100).toFixed(1),
      }));
    }
  };

  const fields = [
    {
      key: "land" as const,
      field: "land_value" as const,
      label: "Terrain",
      tooltip: "La valeur du terrain n'est jamais amortissable. Elle doit être estimée avec soin : une valeur trop faible peut être contestée par le fisc.",
      cgiRef: "CGI art. 39 C",
      color: "bg-amber-100 border-amber-300",
      disabled: false,
    },
    {
      key: "building" as const,
      field: "building_value" as const,
      label: "Bâtiment (structure)",
      tooltip: "Valeur amortissable du bâti. En général : prix total − terrain − mobilier − frais. Amortissable sur 50 ans minimum.",
      cgiRef: "CGI art. 39 A",
      color: "bg-blue-50 border-blue-200",
      disabled: false,
    },
    {
      key: "furniture" as const,
      field: "furniture_value" as const,
      label: "Mobilier",
      tooltip: "Valeur des meubles et équipements. Amortissable sur 5 à 10 ans. Doit être justifiable par des factures.",
      cgiRef: "CGI art. 39 A",
      color: "bg-purple-50 border-purple-200",
      disabled: false,
    },
    {
      key: "costs" as const,
      field: "acquisition_costs" as const,
      label: "Frais d'acquisition",
      tooltip: costsDisabled
        ? "Non applicable : la valeur vénale à la date d'immatriculation LMNP ne comprend pas les frais d'acquisition de l'acte original."
        : "Honoraires notaire, frais d'agence, droits de mutation. Amortissables sur 5 ans en option (ou déductibles en charge l'année d'acquisition).",
      cgiRef: costsDisabled ? undefined : "CGI art. 39 quinquies",
      color: costsDisabled ? "bg-gray-50 border-gray-200" : "bg-green-50 border-green-200",
      disabled: costsDisabled,
    },
  ];

  return (
    <div className="border-t pt-4 mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-700">Décomposition patrimoniale</p>
        {totalPrice > 0 && (
          <button
            type="button"
            onClick={toggleMode}
            className="flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-700 font-medium"
          >
            {pctMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {pctMode ? "Saisie en %" : "Saisie en €"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {fields.map(({ key, field, label, tooltip, cgiRef, color, disabled }) => (
          <div key={field} className={`rounded-lg border p-3 ${color} ${disabled ? "opacity-60" : ""}`}>
            <LabelWithTooltip label={label} tooltip={tooltip} cgiRef={cgiRef} side="right" />

            {disabled ? (
              <div className="form-input bg-gray-100 text-gray-400 cursor-not-allowed text-sm select-none">
                Non applicable
              </div>
            ) : pctMode && totalPrice > 0 ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={pctValues[key]}
                    onChange={(e) => applyPct(key, e.target.value)}
                    className="form-input pr-6"
                    placeholder="0"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <div className="text-xs text-gray-500 self-center whitespace-nowrap">
                  = {formatEuro(watch(field) || 0)}
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  {...register(field, { valueAsNumber: true })}
                  className="form-input pr-6"
                  placeholder="0"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              </div>
            )}

            {!disabled && totalPrice > 0 && (watch(field) || 0) > 0 && !pctMode && (
              <p className="text-xs text-gray-400 mt-1">
                = {formatPct(((watch(field) || 0) / totalPrice) * 100)}
              </p>
            )}

            {/* Fill-remaining button */}
            {!disabled && Math.abs(remaining) > 0.01 && totalPrice > 0 &&
              (remaining > 0 || (watch(field) || 0) + remaining >= 0) && (
              <button
                type="button"
                onClick={() => fillRemaining(key, field)}
                className={`mt-1.5 text-xs font-medium flex items-center gap-0.5 leading-tight ${
                  remaining > 0
                    ? "text-primary-600 hover:text-primary-800"
                    : "text-red-600 hover:text-red-800"
                }`}
                title={
                  remaining > 0
                    ? `Affecter les ${formatEuro(remaining)} non ventilés à ce composant`
                    : `Réduire ce composant de ${formatEuro(-remaining)} pour revenir exactement au prix total`
                }
              >
                {remaining > 0
                  ? `↑ Affecter le solde (+${formatEuro(remaining)})`
                  : `↓ Retirer l'excédent (−${formatEuro(-remaining)})`}
              </button>
            )}

            {errors[field] && <p className="form-error">{errors[field]?.message}</p>}
          </div>
        ))}
      </div>

      {/* Visual breakdown */}
      {totalPrice > 0 && (
        <BreakdownBar
          total={totalPrice}
          land={watched.land}
          building={watched.building}
          furniture={watched.furniture}
          costs={watched.costs}
        />
      )}

      {/* Warnings */}
      <div className="mt-3 space-y-2">
        {totalPrice > 0 && Math.abs(remaining) > 1 && allocated > 0 && (
          <div className={`flex items-start gap-2 text-xs p-2 rounded-lg ${remaining > 0 ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"}`}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {remaining > 0
              ? `Montant non ventilé : ${formatEuro(remaining)}. Répartissez la totalité du prix pour optimiser vos amortissements.`
              : `La somme des composants dépasse le prix total de ${formatEuro(-remaining)}.`}
          </div>
        )}
        {totalPrice > 0 && landPct > 0 && landPct < 15 && watched.land > 0 && (
          <div className="flex items-start gap-2 text-xs p-2 rounded-lg bg-orange-50 text-orange-700">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            Terrain à {formatPct(landPct)} du prix total. Une valeur inférieure à 15–20 % peut être contestée lors d'un contrôle fiscal. Vérifiez avec un notaire.
          </div>
        )}
        {totalPrice > 0 && Math.abs(remaining) <= 1 && allocated > 0 && (
          <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-green-50 text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            Décomposition complète ({formatEuro(allocated)} ventilés sur {formatEuro(totalPrice)})
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Properties page ────────────────────────────────────────────────────

export default function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [situation, setSituation] = useState<Situation>("");

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { land_value: 0, building_value: 0, furniture_value: 0, acquisition_costs: 0, total_price: 0 },
  });

  const totalPrice = watch("total_price") || 0;
  const watchedAddress = watch("address") ?? "";

  const load = () =>
    propertiesApi.list().then((r) => { setProperties(r.data); setLoading(false); });

  useEffect(() => { load(); }, []);

  const onSubmit = async (data: FormData) => {
    setError("");
    try {
      if (editing) {
        await propertiesApi.update(editing.id, data);
      } else {
        await propertiesApi.create(data);
      }
      await load();
      setShowForm(false);
      setEditing(null);
      setSituation("");
      reset();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Erreur lors de l'enregistrement.");
    }
  };

  const handleEdit = (p: Property) => {
    setEditing(p);
    setSituation("");
    reset({
      name: p.name,
      address: p.address ?? "",
      acquisition_date: p.acquisition_date,
      total_price: p.total_price,
      land_value: p.land_value,
      building_value: p.building_value,
      furniture_value: p.furniture_value,
      acquisition_costs: p.acquisition_costs,
      siret: p.siret ?? "",
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Supprimer ce bien ? (les données associées seront conservées)")) return;
    await propertiesApi.delete(id);
    await load();
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Chargement…</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Biens immobiliers</h2>
          <p className="text-gray-500 mt-1">Gérez vos biens meublés loués</p>
        </div>
        <button
          onClick={() => {
            setShowForm(true);
            setEditing(null);
            setSituation("");
            reset({ land_value: 0, building_value: 0, furniture_value: 0, acquisition_costs: 0, total_price: 0 });
          }}
          className="btn-primary"
        >
          <Plus className="w-4 h-4" /> Ajouter un bien
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="card mb-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {editing ? "Modifier le bien" : "Nouveau bien"}
          </h3>
          {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <LabelWithTooltip label="Nom du bien" required tooltip="Nom libre pour identifier ce bien dans l'application." />
                <input {...register("name")} className="form-input" placeholder="Studio Paris 11e" />
                {errors.name && <p className="form-error">{errors.name.message}</p>}
              </div>
              <div>
                <LabelWithTooltip
                  label="Date d'immatriculation LMNP"
                  required
                  tooltip="Date à partir de laquelle le bien est exploité en LMNP. Pour un achat direct mis en location meublée aussitôt : date de l'acte notarié. Pour une conversion (ex-location nue, résidence principale) : date de première mise en location meublée. Elle détermine le prorata temporis de la 1ère année d'amortissement."
                  cgiRef="CGI art. 39 A"
                />
                <input type="date" {...register("acquisition_date")} className="form-input" />
                {errors.acquisition_date && <p className="form-error">{errors.acquisition_date.message}</p>}
              </div>
            </div>
            <div>
              <label className="form-label">Adresse</label>
              <input {...register("address")} className="form-input" placeholder="42 rue Oberkampf, 75011 Paris" />
            </div>
            <div>
              <LabelWithTooltip
                label="Valeur du bien à la date d'immatriculation LMNP"
                required
                tooltip="Ce n'est pas toujours le prix d'achat : si le bien était loué nu ou occupé en résidence principale avant d'être loué meublé, utilisez la valeur vénale à la date de transition, pas le prix historique. Cliquez sur 'Quel prix saisir ?' pour un guide détaillé et des outils d'estimation."
              />
              <div className="relative max-w-xs">
                <input type="number" step="0.01" {...register("total_price", { valueAsNumber: true })} className="form-input pr-6" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
              </div>
              {errors.total_price && <p className="form-error">{errors.total_price.message}</p>}
              <PriceContextPanel
                address={watchedAddress}
                situation={situation}
                onSituationChange={setSituation}
              />
            </div>
            <div className="max-w-xs">
              <LabelWithTooltip
                label="SIRET"
                tooltip="Numéro SIRET de votre activité LMNP. Obligatoire si vous êtes assujetti à la TVA. Sinon, laissez vide."
              />
              <input {...register("siret")} className="form-input" placeholder="12345678901234" />
            </div>

            <PatrimonialDecomposition
              totalPrice={totalPrice}
              register={register}
              setValue={setValue}
              watch={watch}
              errors={errors}
              situation={situation}
            />

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary">{editing ? "Enregistrer" : "Créer"}</button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditing(null); setSituation(""); }}
                className="btn-secondary"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {properties.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p>Aucun bien enregistré. Ajoutez votre premier bien pour commencer.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {properties.map((p) => {
            const allocated = p.land_value + p.building_value + p.furniture_value + p.acquisition_costs;
            const landPct = p.total_price > 0 ? (p.land_value / p.total_price) * 100 : 0;
            const isComplete = Math.abs(p.total_price - allocated) < 1 && allocated > 0;
            const landTooLow = landPct > 0 && landPct < 15 && p.total_price > 0;
            const decompositionIncomplete = p.total_price > 0 && !isComplete && allocated < p.total_price - 1;

            const warnings: string[] = [];
            if (landTooLow)
              warnings.push(`Terrain à ${formatPct(landPct)} du prix total — valeur inférieure à 15 % potentiellement contestable (CGI art. 39 C).`);
            if (decompositionIncomplete)
              warnings.push(`Décomposition incomplète : ${formatEuro(p.total_price - allocated)} non ventilé(s) — chaque euro non ventilé n'est pas amortissable.`);

            return (
              <div
                key={p.id}
                className={`card border-l-4 ${
                  warnings.length > 0 ? "border-l-amber-400" : isComplete ? "border-l-green-400" : "border-l-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="w-4 h-4 text-primary-600" />
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
                      {isComplete && warnings.length === 0 && (
                        <span className="badge-success">Décomposition complète</span>
                      )}
                      {warnings.length > 0 && (
                        <span className="badge-warning flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {warnings.length} alerte{warnings.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    {p.address && <p className="text-sm text-gray-500">{p.address}</p>}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button onClick={() => handleEdit(p)} className="p-2 text-gray-400 hover:text-primary-600 rounded-lg hover:bg-gray-50">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 text-sm mb-3">
                  {[
                    { label: "Acquis le", value: new Date(p.acquisition_date).toLocaleDateString("fr-FR") },
                    { label: "Prix total", value: formatEuro(p.total_price) },
                    { label: "Terrain", value: `${formatEuro(p.land_value)} (${formatPct(landPct)})`, highlight: landTooLow },
                    { label: "Bâtiment", value: formatEuro(p.building_value) },
                  ].map(({ label, value, highlight }) => (
                    <div key={label}>
                      <span className="text-gray-400 text-xs">{label}</span>
                      <p className={`font-medium ${highlight ? "text-amber-700" : "text-gray-800"}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {p.total_price > 0 && (
                  <BreakdownBar
                    total={p.total_price}
                    land={p.land_value}
                    building={p.building_value}
                    furniture={p.furniture_value}
                    costs={p.acquisition_costs}
                  />
                )}

                {warnings.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    {warnings.map((w, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-500" />
                        <span>{w}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => handleEdit(p)}
                      className="text-xs text-primary-600 hover:text-primary-800 font-medium underline"
                    >
                      Corriger dans le formulaire →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
