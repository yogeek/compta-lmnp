import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Properties from "./pages/Properties";
import Revenues from "./pages/Revenues";
import Expenses from "./pages/Expenses";
import Depreciation from "./pages/Depreciation";
import FiscalSummary from "./pages/FiscalSummary";
import ExportPage from "./pages/ExportPage";
import Assistant from "./pages/Assistant";
import Wizard from "./pages/Wizard";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="wizard" element={<Wizard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="revenues" element={<Revenues />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="depreciation" element={<Depreciation />} />
          <Route path="summary" element={<FiscalSummary />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="assistant" element={<Assistant />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
