import { AdminCourseDetailPage } from "./course-detail-page";
export default function Page(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; snapshot?: string; import?: string }>;
}) {
  return <AdminCourseDetailPage {...props} />;
}
export const dynamic = "force-dynamic";
