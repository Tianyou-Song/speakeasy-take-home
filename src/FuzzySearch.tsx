import { useMemo } from "react";
import { FacetSearch } from "./facet-search";
import type { FacetConfig } from "./facet-search";
import type { HttpLog } from "./types";

interface FuzzySearchProps {
  data: HttpLog[];
  onChange: (data: HttpLog[]) => void;
}

export function FuzzySearch({ data, onChange }: FuzzySearchProps) {
  const facets = useMemo<FacetConfig<HttpLog>[]>(
    () => [
      {
        key: "method",
        label: "Method",
        description: "HTTP verb",
        type: "enum",
        chipVariant: () => "info",
      },
      {
        key: "status",
        label: "Status",
        description: "Response status code",
        type: "number",
        accessor: (row) => row.statusCode,
        chipVariant: (value) => {
          const n = Number(value);
          if (n >= 500) return "danger";
          if (n >= 400) return "warning";
          if (n >= 300) return "info";
          if (n >= 200) return "success";
          return "neutral";
        },
      },
      {
        key: "domain",
        label: "Domain",
        description: "Origin domain",
        type: "string",
        chipVariant: () => "accent",
      },
      {
        key: "path",
        label: "Path",
        description: "Request path",
        type: "string",
        chipVariant: () => "neutral",
      },
    ],
    [],
  );

  return (
    <div className="w-full max-w-3xl">
      <FacetSearch<HttpLog>
        rows={data}
        facets={facets}
        onFilteredChange={onChange}
        placeholder="Filter logs… (try `method:`, `status:`, `domain:`, `path:`)"
        storageKey="speakeasy-fuzzy-search:recents:v1"
      />
    </div>
  );
}
