import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Types
export interface Property {
  id: number;
  name: string;
  address: string | null;
  acquisition_date: string;
  total_price: number;
  land_value: number;
  building_value: number;
  furniture_value: number;
  acquisition_costs: number;
  siret: string | null;
  is_active: boolean;
}

export interface PropertyCreate {
  name: string;
  address?: string;
  acquisition_date: string;
  total_price: number;
  land_value: number;
  building_value: number;
  furniture_value: number;
  acquisition_costs: number;
  siret?: string;
}

export interface Revenue {
  id: number;
  property_id: number;
  fiscal_year: number;
  month: number;
  amount: number;
  type: string;
  notes: string | null;
}

export interface Expense {
  id: number;
  property_id: number;
  fiscal_year: number;
  date: string;
  amount: number;
  category: string;
  description: string | null;
  deductible_pct: number;
  receipt_path?: string | null;
}

export interface DepreciationPlan {
  id: number;
  property_id: number;
  component: string;
  component_label: string;
  value: number;
  duration_years: number;
  start_date: string;
  method: string;
  fiscal_year: number;
  annual_amount: number;
  deductible_amount: number;
  carried_over: number;
}

export interface FiscalSummary {
  property_id: number;
  year: number;
  total_revenue: number;
  total_expenses: number;
  result_before_depreciation: number;
  total_depreciation_annual: number;
  total_depreciation_deductible: number;
  total_depreciation_carried: number;
  fiscal_result: number;
  balance_sheet: {
    asset_gross: number;
    asset_depreciation_cumul: number;
    asset_net: number;
    cash: number;
    total_assets: number;
    equity: number;
    total_liabilities_equity: number;
  };
}

export interface ValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  field: string | null;
  cgi_ref: string | null;
}

export interface ComparisonResult {
  year: number;
  total_revenue: number;
  regime_type: string;
  micro_bic: { threshold: number; abatement_pct: number; taxable_base: number };
  reel: { taxable_base: number; deficit: number };
  micro_bic_vs_reel_difference: number;
  recommended_regime: string;
  above_threshold: boolean;
  explanation: string;
}

// API functions
export const propertiesApi = {
  list: () => api.get<Property[]>("/api/properties/"),
  get: (id: number) => api.get<Property>(`/api/properties/${id}`),
  create: (data: PropertyCreate) => api.post<Property>("/api/properties/", data),
  update: (id: number, data: Partial<PropertyCreate>) =>
    api.put<Property>(`/api/properties/${id}`, data),
  delete: (id: number) => api.delete(`/api/properties/${id}`),
};

export const revenuesApi = {
  list: (propertyId?: number, fiscalYear?: number) =>
    api.get<Revenue[]>("/api/revenues/", { params: { property_id: propertyId, fiscal_year: fiscalYear } }),
  create: (data: Omit<Revenue, "id">) => api.post<Revenue>("/api/revenues/", data),
  update: (id: number, data: Omit<Revenue, "id">) => api.put<Revenue>(`/api/revenues/${id}`, data),
  delete: (id: number) => api.delete(`/api/revenues/${id}`),
  summary: (propertyId: number, year: number) =>
    api.get(`/api/revenues/summary/${propertyId}/${year}`),
};

export const expensesApi = {
  list: (propertyId?: number, fiscalYear?: number) =>
    api.get<Expense[]>("/api/expenses/", { params: { property_id: propertyId, fiscal_year: fiscalYear } }),
  create: (data: Omit<Expense, "id">) => api.post<Expense>("/api/expenses/", data),
  update: (id: number, data: Omit<Expense, "id">) => api.put<Expense>(`/api/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/api/expenses/${id}`),
  categories: (year?: number) => api.get("/api/expenses/categories", { params: { year } }),
  summary: (propertyId: number, year: number) =>
    api.get(`/api/expenses/summary/${propertyId}/${year}`),
};

export const depreciationApi = {
  list: (propertyId?: number, fiscalYear?: number) =>
    api.get<DepreciationPlan[]>("/api/depreciation/", {
      params: { property_id: propertyId, fiscal_year: fiscalYear },
    }),
  create: (data: Omit<DepreciationPlan, "id" | "annual_amount" | "deductible_amount" | "carried_over">) =>
    api.post<DepreciationPlan>("/api/depreciation/", data),
  delete: (id: number) => api.delete(`/api/depreciation/${id}`),
  components: (year?: number) => api.get("/api/depreciation/components", { params: { year } }),
  compute: (propertyId: number, year: number, resultBeforeDepreciation: number, previousCarriedOver = 0) =>
    api.post(`/api/depreciation/compute/${propertyId}/${year}`, null, {
      params: { result_before_depreciation: resultBeforeDepreciation, previous_carried_over: previousCarriedOver },
    }),
};

export const fiscalApi = {
  summary: (propertyId: number, year: number) =>
    api.get<FiscalSummary>(`/api/fiscal/summary/${propertyId}/${year}`),
  compare: (propertyId: number, year: number, regimeType = "standard") =>
    api.get<ComparisonResult>(`/api/fiscal/compare/${propertyId}/${year}`, {
      params: { regime_type: regimeType },
    }),
  validate: (propertyId: number, year: number) =>
    api.get<{ has_errors: boolean; issues: ValidationIssue[] }>(
      `/api/fiscal/validate/${propertyId}/${year}`
    ),
  liasse: (propertyId: number, year: number) =>
    api.get(`/api/fiscal/liasse/${propertyId}/${year}`),
  exportPdf: (propertyId: number, year: number, formId: string) =>
    `${BASE_URL}/api/fiscal/export/pdf/${propertyId}/${year}/${formId}`,
  exportXml: (propertyId: number, year: number) =>
    `${BASE_URL}/api/fiscal/export/xml/${propertyId}/${year}`,
  exportZip: (propertyId: number, year: number) =>
    `${BASE_URL}/api/fiscal/export/zip/${propertyId}/${year}`,
};

export const assistantApi = {
  ask: (question: string, context?: Record<string, unknown>) =>
    api.post("/api/assistant/ask", { question, context }),
  faq: () => api.get("/api/assistant/faq"),
};
