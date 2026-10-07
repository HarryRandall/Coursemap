import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { badgeVariantForTone } from "@/lib/ui";
import {
  type SeltReportStatus,
  seltReportStatusLabel,
} from "@/lib/selt/admin-format";

const PRESENTATION = {
  ready: { tone: "brand", icon: Send },
  blocked: { tone: "danger", icon: CircleAlert },
  published: { tone: "success", icon: CircleCheck },
} as const;

export function SeltStatusBadge({ status }: { status: SeltReportStatus }) {
  const { tone, icon: Icon } = PRESENTATION[status];
  return (
    <Badge variant={badgeVariantForTone[tone]}>
      <Icon aria-hidden="true" />
      {seltReportStatusLabel(status)}
    </Badge>
  );
}
