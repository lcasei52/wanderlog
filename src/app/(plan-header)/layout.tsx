import PlanHeader from "./plan/components/PlanHeader";

export default function PlanHeaderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full flex-col">
      <PlanHeader />
      {children}
    </div>
  );
}
