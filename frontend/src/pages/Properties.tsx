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

function formatEuro(v: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

function formatPct(v: number) {
  return `${v.toFixed(1)} %`;
}

// ─── Price context helpers ─────────────────────────────────────────────────

function parseAddress(address: string): { commune: string; codePostal: string } {
  const match = address.match(/(\d{5})\s+([A-Za-zÀ-ÿ\s'-]+?)(?:[,\s]|$)/);
  if (match) return { codePostal: match[1], commune: match[2].trim() };
  return { commune: "", codePostal: "" };
}

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

function PriceContextPanel({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dvfLoading, setDvfLoading] = useState(false);
  const [dvfResults, setDvfResults] = useState<DvfMutation[] | null>(null);
  const [dvfError, setDvfError] = useState("");

  const { commune, codePostal } = parseAddress(address);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchDvf = async () => {
    if (!codePostal) return;
    setDvfLoading(true);
    setDvfError("");
    setDvfResults(null);
    try {
      // Step 1: resolve postal code → INSEE commune code via geo.api.gouv.fr
      const geoRes = await fetch(
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

      // Step 2: query CEREMA DVF mutations API with INSEE code
      const dvfRes = await fetch(
        `https://apidf-preprod.cerema.fr/dvf_opendata/mutations/?code_insee=${codeInsee}&libnatmut=Vente&limit=15`
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Quel prix saisir ? · Estimer la valeur vénale
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-4">

          {/* Scenario guide */}
          <div>
            <p className="text-xs font-semibold text-indigo-900 mb-2">Quel prix utiliser selon votre situation ?</p>
            <div className="space-y-2">
              {[
                {
                  title: "Achat récent, mis en location meublée aussitôt",
                  value: "→ Prix figurant dans l'acte notarié (hors frais notaire et agence à saisir séparément).",
                },
                {
                  title: "Bien anciennement loué nu ou occupé en RP, converti en LMNP",
                  value: "→ Valeur vénale du bien à la date de première mise en location meublée (pas le prix d'achat historique). Cette valeur doit être estimée.",
                },
                {
                  title: "Passage du régime Micro-BIC au régime réel",
                  value: "→ Valeur retenue lors de l'immatriculation initiale en LMNP (généralement la date de première mise en location meublée).",
                },
              ].map((s, i) => (
                <div key={i} className="bg-white rounded-lg border border-indigo-100 p-2.5 text-xs">
                  <p className="font-medium text-indigo-800 mb-0.5">{s.title}</p>
                  <p className="text-gray-600">{s.value}</p>
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
                {!dvfResults && !dvfLoading && (
                  <button
                    type="button"
                    onClick={fetchDvf}
                    className="flex items-center gap-1.5 text-xs btn-secondary py-1.5"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Rechercher les ventes récentes à {commune || codePostal}
                  </button>
                )}
                {dvfLoading && (
                  <div className="text-xs text-indigo-500 flex items-center gap-2">
                    <div className="animate-spin w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full" />
                    Chargement des données DVF…
                  </div>
                )}
                {dvfError && <p className="text-xs text-red-600">{dvfError}</p>}
                {dvfResults && dvfResults.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Pas de données DVF disponibles pour cette commune (couverture CEREMA limitée). Consultez les outils ci-dessous.
                  </p>
                )}
                {dvfResults && dvfResults.length > 0 && (
                  <div>
                    <p className="text-xs text-indigo-600 mb-2">
                      {dvfResults.filter((m) => parseFloat(m.sbati) > 0 && parseFloat(m.valeurfonc) > 0).length} transaction(s) — {commune || codePostal} — données DVF
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-indigo-100 text-indigo-700">
                            <th className="text-left px-2 py-1.5 font-medium">Type</th>
                            <th className="text-left px-2 py-1.5 font-medium">Date</th>
                            <th className="text-right px-2 py-1.5 font-medium">Surface</th>
                            <th className="text-right px-2 py-1.5 font-medium">Prix</th>
                            <th className="text-right px-2 py-1.5 font-medium">€/m²</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dvfResults
                            .filter((m) => parseFloat(m.sbati) > 0 && parseFloat(m.valeurfonc) > 0)
                            .map((m, i) => {
                              const prix = parseFloat(m.valeurfonc);
                              const surf = parseFloat(m.sbati);
                              return (
                              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-indigo-50/50"}>
                                <td className="px-2 py-1.5 text-gray-600">{m.libtypbien}</td>
                                <td className="px-2 py-1.5 text-gray-600">
                                  {new Date(m.datemut).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
                                </td>
                                <td className="px-2 py-1.5 text-right">{surf} m²</td>
                                <td className="px-2 py-1.5 text-right font-medium">
                                  {formatEuro(prix)}
                                </td>
                                <td className="px-2 py-1.5 text-right text-indigo-700 font-medium">
                                  {formatEuro(prix / surf)}/m²
                                </td>
                              </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Source : Demandes de Valeurs Foncières (DVF) — données officielles de l'État français.
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

// Visual breakdown bar
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

// Patrimonial decomposition with % / € toggle
interface DecompositionProps {
  totalPrice: number;
  register: ReturnType<typeof useForm<FormData>>["register"];
  setValue: ReturnType<typeof useForm<FormData>>["setValue"];
  watch: ReturnType<typeof useForm<FormData>>["watch"];
  errors: ReturnType<typeof useForm<FormData>>["formState"]["errors"];
}

function PatrimonialDecomposition({ totalPrice, register, setValue, watch, errors }: DecompositionProps) {
  const [pctMode, setPctMode] = useState(false);
  const [pctValues, setPctValues] = useState({ land: "", building: "", furniture: "", costs: "" });

  const watched = {
    land: watch("land_value") || 0,
    building: watch("building_value") || 0,
    furniture: watch("furniture_value") || 0,
    costs: watch("acquisition_costs") || 0,
  };

  const allocated = watched.land + watched.building + watched.furniture + watched.costs;
  const remaining = totalPrice > 0 ? totalPrice - allocated : 0;
  const landPct = totalPrice > 0 ? (watched.land / totalPrice) * 100 : 0;

  // When switching to % mode, convert current € to %
  const toggleMode = () => {
    if (!pctMode && totalPrice > 0) {
      setPctValues({
        land: watched.land > 0 ? ((watched.land / totalPrice) * 100).toFixed(1) : "",
        building: watched.building > 0 ? ((watched.building / totalPrice) * 100).toFixed(1) : "",
        furniture: watched.furniture > 0 ? ((watched.furniture / totalPrice) * 100).toFixed(1) : "",
        costs: watched.costs > 0 ? ((watched.costs / totalPrice) * 100).toFixed(1) : "",
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

  const fields = [
    {
      key: "land" as const,
      field: "land_value" as const,
      label: "Terrain",
      tooltip: "La valeur du terrain n'est jamais amortissable. Elle doit être estimée avec soin : une valeur trop faible peut être contestée par le fisc.",
      cgiRef: "CGI art. 39 C",
      color: "bg-amber-100 border-amber-300",
    },
    {
      key: "building" as const,
      field: "building_value" as const,
      label: "Bâtiment (structure)",
      tooltip: "Valeur amortissable du bâti. En général : prix total − terrain − mobilier − frais. Amortissable sur 50 ans minimum.",
      cgiRef: "CGI art. 39 A",
      color: "bg-blue-50 border-blue-200",
    },
    {
      key: "furniture" as const,
      field: "furniture_value" as const,
      label: "Mobilier",
      tooltip: "Valeur des meubles et équipements. Amortissable sur 5 à 10 ans. Doit être justifiable par des factures.",
      cgiRef: "CGI art. 39 A",
      color: "bg-purple-50 border-purple-200",
    },
    {
      key: "costs" as const,
      field: "acquisition_costs" as const,
      label: "Frais d'acquisition",
      tooltip: "Honoraires notaire, frais d'agence, droits de mutation. Amortissables sur 5 ans en option (ou déductibles en charge l'année d'acquisition).",
      cgiRef: "CGI art. 39 quinquies",
      color: "bg-green-50 border-green-200",
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
        {fields.map(({ key, field, label, tooltip, cgiRef, color }) => (
          <div key={field} className={`rounded-lg border p-3 ${color}`}>
            <LabelWithTooltip label={label} tooltip={tooltip} cgiRef={cgiRef} side="right" />
            {pctMode && totalPrice > 0 ? (
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
            {totalPrice > 0 && (watch(field) || 0) > 0 && !pctMode && (
              <p className="text-xs text-gray-400 mt-1">
                = {formatPct(((watch(field) || 0) / totalPrice) * 100)}
              </p>
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

export default function Properties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      reset();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Erreur lors de l'enregistrement.");
    }
  };

  const handleEdit = (p: Property) => {
    setEditing(p);
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
          onClick={() => { setShowForm(true); setEditing(null); reset({ land_value: 0, building_value: 0, furniture_value: 0, acquisition_costs: 0, total_price: 0 }); }}
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
              <PriceContextPanel address={watchedAddress} />
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
            />

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary">{editing ? "Enregistrer" : "Créer"}</button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary">
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

            // Collect card-level warnings
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

                {/* Warning banners — expanded, actionable */}
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
