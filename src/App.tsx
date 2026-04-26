import { Table, Column } from "@speakeasy-api/moonshine";
import "./App.css";
import { data as sampleData } from "./data";
import { FuzzySearch } from "./FuzzySearch";
import { HttpLog } from "./types";
import "@speakeasy-api/moonshine/moonshine.css";
import { useState } from "react";

const columns: Column<HttpLog>[] = [
  {
    key: "id",
    header: "ID",
    width: "0.25fr",
  },
  {
    key: "domain",
    header: "Domain",
    width: "0.75fr",
  },
  {
    key: "method",
    header: "Method",
    width: "0.5fr",
  },
  {
    key: "path",
    header: "Path",
    width: "1fr",
  },
  {
    key: "statusCode",
    header: "Status Code",
    width: "0.5fr",
  },
];

function App() {
  const [data, setData] = useState<HttpLog[]>(sampleData);
  return (
    <div className="mx-auto my-10 flex h-full max-w-3xl flex-col gap-6 px-6 text-left">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">
          HTTP Logs
        </h1>
        <p className="text-sm text-zinc-500">
          {sampleData.length} events · sample dataset · filter by{" "}
          <span className="font-mono text-zinc-400">method</span>,{" "}
          <span className="font-mono text-zinc-400">status</span>,{" "}
          <span className="font-mono text-zinc-400">domain</span>, or{" "}
          <span className="font-mono text-zinc-400">path</span>
        </p>
      </header>

      <FuzzySearch data={sampleData} onChange={setData} />

      <div className="text-xs text-zinc-500">
        {data.length === sampleData.length
          ? `Showing all ${sampleData.length} events`
          : `Showing ${data.length} of ${sampleData.length} events`}
      </div>

      <Table
        data={data}
        noResultsMessage={
          <div className="text-gray-500 p-6">No results found</div>
        }
        columns={columns}
        rowKey={(row) => row.id}
      />
    </div>
  );
}

export default App;
