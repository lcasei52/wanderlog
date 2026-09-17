export default function GuidesPage() {
  // 跟 header 用同一个壳（globals.css 的 .app-shell），否则标题缩进和头部对不上
  return (
    <div className="app-shell py-8">
      <h1 className="text-3xl font-bold">旅行指南</h1>
      <p className="mt-4 text-gray-600">探索各地旅行指南和攻略</p>
    </div>
  );
}
