import { ReportView } from "@/components/ReportView";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="container" style={{ paddingTop: 44, paddingBottom: 40 }}>
      <ReportView id={id} />
    </div>
  );
}
