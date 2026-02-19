import { Outlet, NavLink } from "react-router-dom";
import {
  Home,
  Building2,
  TrendingUp,
  Receipt,
  BarChart3,
  FileText,
  Download,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import { useLmnpStore } from "../store";
import clsx from "clsx";

const navigation = [
  { name: "Tableau de bord", href: "/", icon: Home },
  { name: "Biens", href: "/properties", icon: Building2 },
  { name: "Revenus", href: "/revenues", icon: TrendingUp },
  { name: "Charges", href: "/expenses", icon: Receipt },
  { name: "Amortissements", href: "/depreciation", icon: BarChart3 },
  { name: "Récapitulatif fiscal", href: "/summary", icon: FileText },
  { name: "Exporter la liasse", href: "/export", icon: Download },
  { name: "Assistant fiscal", href: "/assistant", icon: MessageSquare },
];

export default function Layout() {
  const { selectedYear, setSelectedYear } = useLmnpStore();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gov-blue text-white flex flex-col flex-shrink-0">
        <div className="p-6 border-b border-blue-700">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-6 h-6 text-blue-200" />
            <h1 className="text-lg font-bold">LMNP Réel</h1>
          </div>
          <p className="text-xs text-blue-300">Déclaration open source</p>
        </div>

        {/* Year selector */}
        <div className="px-4 py-3 border-b border-blue-700">
          <label className="text-xs text-blue-300 font-medium block mb-1">Exercice fiscal</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full bg-blue-800 text-white text-sm rounded px-2 py-1.5 border border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navigation.map(({ name, href, icon: Icon }) => (
            <NavLink
              key={href}
              to={href}
              end={href === "/"}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-white/20 text-white font-medium"
                    : "text-blue-200 hover:bg-white/10 hover:text-white"
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-blue-700">
          <NavLink
            to="/wizard"
            className="flex items-center justify-between gap-2 w-full px-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
          >
            <span>Démarrer pas à pas</span>
            <ChevronRight className="w-4 h-4" />
          </NavLink>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
