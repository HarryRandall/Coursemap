import { AdminCourseDetailPage } from "../course-detail-page";
export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  return <AdminCourseDetailPage {...props} pageView="history" />;
}
