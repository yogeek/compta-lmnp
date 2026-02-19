import { useState } from "react";
import { Download, FileText, Code, Archive } from "lucide-react";
import { fiscalApi } from "../lib/api";
import { useLmnpStore } from "../store";

const FORMS = [
  { id: "2031", name: "2031 — Déclaration de résultats BIC", icon: FileText },
  { id: "2033-A", name: "2033-A — Bilan simplifié", icon: FileText },
  { id: "2033-B", name: "2033-B — Compte de résultat", icon: FileText },
  { id: "2033-C", name: "2033-C — Immobilisations et amortissements", icon: FileText },
  { id: "2033-D", name: "2033-D — Provisions", icon: FileText },
  { id: "2033-E", name: "2033-E — Valeur ajoutée", icon: FileText },
  { id: "2033-F", name: "2033-F — Composition du capital", icon: FileText },
  { id: "2033-G", name: "2033-G — Filiales", icon: FileText },
  { id: "summary", name: "Fiche récapitulative (archivage)", icon: FileText },
];

export default function ExportPage() {
  const { selectedPropertyId, selectedYear } = useLmnpStore();
  const [loading, setLoading] = useState<string | null>(null);

  const handleDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  };

  const downloadPdf = (formId: string) => {
    if (!selectedPropertyId) return;
    const url = fiscalApi.exportPdf(selectedPropertyId, selectedYear, formId);
    handleDownload(url, `LMNP_${selectedYear}_${formId}.pdf`);
  };

  const downloadXml = () => {
    if (!selectedPropertyId) return;
    const url = fiscalApi.exportXml(selectedPropertyId, selectedYear);
    handleDownload(url, `LMNP_${selectedYear}_liasse.xml`);
  };

  const downloadZip = async () => {
    if (!selectedPropertyId) return;
    setLoading("zip");
    try {
      const url = fiscalApi.exportZip(selectedPropertyId, selectedYear);
      handleDownload(url, `LMNP_${selectedYear}_liasse_complete.zip`);
    } finally {
      setTimeout(() => setLoading(null), 2000);
    }
  };

  if (!selectedPropertyId) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="card text-center text-gray-500 py-12">
          Sélectionnez un bien pour exporter la liasse fiscale.
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Exporter la liasse fiscale — {selectedYear}</h2>
        <p className="text-gray-500 mt-1">Téléchargez vos formulaires CERFA en PDF ou XML</p>
      </div>

      {/* ZIP all-in-one */}
      <div className="card mb-6 bg-primary-50 border-primary-200">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Archive className="w-5 h-5 text-primary-600" />
              <h3 className="font-semibold text-primary-900">Télécharger toute la liasse</h3>
            </div>
            <p className="text-sm text-primary-700">PDF + XML + fiche récapitulative en un seul fichier ZIP</p>
          </div>
          <button
            onClick={downloadZip}
            disabled={loading === "zip"}
            className="btn-primary"
          >
            <Download className="w-4 h-4" />
            {loading === "zip" ? "Génération…" : "Tout télécharger"}
          </button>
        </div>
      </div>

      {/* XML */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Code className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold">Export XML (EDI-TDFC)</h3>
            </div>
            <p className="text-sm text-gray-500">Format compatible impots.gouv.fr</p>
          </div>
          <button onClick={downloadXml} className="btn-secondary">
            <Download className="w-4 h-4" /> Télécharger XML
          </button>
        </div>
      </div>

      {/* Individual PDFs */}
      <div className="card">
        <h3 className="font-semibold mb-4">Formulaires individuels (PDF)</h3>
        <div className="space-y-2">
          {FORMS.map(({ id, name, icon: Icon }) => (
            <div key={id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-700">{name}</span>
              </div>
              <button onClick={() => downloadPdf(id)} className="btn-secondary text-xs py-1 px-3">
                <Download className="w-3 h-3" /> PDF
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
        <strong>⚠ Avertissement :</strong> Ces documents sont générés à titre indicatif et doivent être vérifiés avant tout dépôt officiel sur impots.gouv.fr. Consultez un expert-comptable en cas de doute.
      </div>
    </div>
  );
}
