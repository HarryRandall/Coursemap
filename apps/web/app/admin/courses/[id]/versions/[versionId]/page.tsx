import { AdminCourseDetailPage } from "../../course-detail-page";
export default async function VersionPage(props: {
  params: Promise<{ id: string; versionId: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  const params = await props.params;
  return (
    <AdminCourseDetailPage {...props} versionPublicId={params.versionId} />
  );
}
