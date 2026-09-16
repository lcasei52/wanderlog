import { ClipboardList } from "lucide-react";
import { CATEGORY_ICONS, type ExpenseCategory } from "@/types/expense";
import { cn } from "@/lib/utils";

interface CategoryIconProps {
  /**
   * 库里 category 是自由文本列（text），取出来是 string 而不是枚举，
   * 所以这里兜一下：不认识的类别给个默认图标，而不是渲染出 undefined。
   */
  category?: string | null;
  className?: string;
}

/**
 * 费用类别图标。11 个类别共用一套单色线性图标（见 CATEGORY_ICONS），
 * 颜色不写死、由外层的 text-* 给，所以放在深色底或浅色底上都成立。
 *
 * 默认 size-4：绝大多数场合是跟在文字前面的小图标。要更大的（列表行里那个
 * 圆底图标）传 className="size-5" 之类盖掉。
 */
export default function CategoryIcon({ category, className }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category as ExpenseCategory] ?? ClipboardList;
  return <Icon className={cn("size-4", className)} />;
}
