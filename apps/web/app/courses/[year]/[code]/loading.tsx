import { Tabs } from "@coursemap/ui/primitives/tabs";
import { PublicRecordLoading } from "@/ui/catalogue/public-record-loading";
import { CourseDetailTabsList } from "@/ui/courses/course-detail-view";

export default function Loading() {
  return (
    <Tabs defaultValue="overview" className="gap-0">
      <PublicRecordLoading
        label="course"
        tabs={<CourseDetailTabsList disabled />}
      />
    </Tabs>
  );
}
