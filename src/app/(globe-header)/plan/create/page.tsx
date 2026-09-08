import CreatePlanForm from "./components/CreatePlanForm";

export default function CreatePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        计划一次新行程
      </h1>
      <CreatePlanForm />
    </div>
  );
}
