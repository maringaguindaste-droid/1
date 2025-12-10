import { useCompany } from "@/contexts/CompanyContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function CompanySelector() {
  const { companies, selectedCompany, setSelectedCompany, userCompanies } = useCompany();

  const availableCompanies = userCompanies.length > 0 ? userCompanies : companies;

  if (availableCompanies.length === 0) {
    return null;
  }

  if (availableCompanies.length === 1) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 rounded-lg">
        <Building2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{availableCompanies[0].name}</span>
      </div>
    );
  }

  return (
    <Select
      value={selectedCompany?.id || ""}
      onValueChange={(value) => {
        const company = availableCompanies.find((c) => c.id === value);
        setSelectedCompany(company || null);
      }}
    >
      <SelectTrigger className="w-[200px] bg-secondary/50 border-border/50">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          <SelectValue placeholder="Selecione a empresa" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {availableCompanies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
