"use client";

import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { RequestStatusBadge, type RequestStatus } from "@/components/category-requests/status-badge";

type Row = { id: string; name: string; parentPath: string; requester: string; attributeCount: number; status: RequestStatus; createdAt: string };

export function RequestsTable({ rows, empty }: { rows: Row[]; empty: string }) {
  const router = useRouter();
  if (rows.length === 0) {
    return <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-400">{empty}</div>;
  }
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {["Requested category", "Requested by", "Attributes", "Status", "Submitted"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => router.push(`/category-requests/${r.id}`)} className="border-t border-gray-200 hover:bg-gray-50 cursor-pointer">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{r.name}</div>
                {r.parentPath && <div className="text-xs text-gray-500">{r.parentPath} &gt; {r.name}</div>}
              </td>
              <td className="px-4 py-3 text-gray-700">{r.requester}</td>
              <td className="px-4 py-3 text-gray-700">{r.attributeCount}</td>
              <td className="px-4 py-3"><RequestStatusBadge status={r.status} /></td>
              <td className="px-4 py-3 text-gray-500">{formatDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
