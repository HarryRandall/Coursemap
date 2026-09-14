export function adminCourseDetailPath({ publicId }: { publicId: string }) {
  return `/admin/courses/${encodeURIComponent(publicId)}`;
}
