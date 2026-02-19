import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Property, FiscalSummary, ValidationIssue } from "../lib/api";

interface LmnpStore {
  // Selected context
  selectedPropertyId: number | null;
  selectedYear: number;

  // Wizard state
  wizardStep: number;
  wizardCompleted: boolean;

  // Cached data
  properties: Property[];
  fiscalSummary: FiscalSummary | null;
  validationIssues: ValidationIssue[];

  // Actions
  setSelectedProperty: (id: number | null) => void;
  setSelectedYear: (year: number) => void;
  setWizardStep: (step: number) => void;
  setWizardCompleted: (done: boolean) => void;
  setProperties: (props: Property[]) => void;
  setFiscalSummary: (summary: FiscalSummary | null) => void;
  setValidationIssues: (issues: ValidationIssue[]) => void;
  reset: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

export const useLmnpStore = create<LmnpStore>()(
  persist(
    (set) => ({
      selectedPropertyId: null,
      selectedYear: CURRENT_YEAR - 1, // default to previous year
      wizardStep: 0,
      wizardCompleted: false,
      properties: [],
      fiscalSummary: null,
      validationIssues: [],

      setSelectedProperty: (id) => set({ selectedPropertyId: id }),
      setSelectedYear: (year) => set({ selectedYear: year }),
      setWizardStep: (step) => set({ wizardStep: step }),
      setWizardCompleted: (done) => set({ wizardCompleted: done }),
      setProperties: (props) => set({ properties: props }),
      setFiscalSummary: (summary) => set({ fiscalSummary: summary }),
      setValidationIssues: (issues) => set({ validationIssues: issues }),
      reset: () =>
        set({
          selectedPropertyId: null,
          wizardStep: 0,
          wizardCompleted: false,
          fiscalSummary: null,
          validationIssues: [],
        }),
    }),
    {
      name: "lmnp-store",
      partialize: (state) => ({
        selectedPropertyId: state.selectedPropertyId,
        selectedYear: state.selectedYear,
        wizardStep: state.wizardStep,
      }),
    }
  )
);
