import { getMonthlyReport } from "@/app/admin/reports/actions";
import { ReportTable } from "@/app/admin/reports/report-table";

export default async function AdminReportsPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const data = await getMonthlyReport(year, month);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">月結報表</h1>
      <ReportTable initialData={data} initialYear={year} initialMonth={month} />
    </div>
  );
}
